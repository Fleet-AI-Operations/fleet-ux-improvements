// ============= diff-viewer.js =============
// Diff Viewer tab for the Ops dashboard.
// Provides a slot-machine side-by-side task/version diff, a free-text diff sub-mode,
// and an "Add to Diff" action that hooks into Search Output cards.

// ── Constants ──

const DV_STASH_KEY = 'fleet-ux:diff-viewer-stash';
const DV_GRANULARITY_KEY = 'fleet-ux:diff-viewer-granularity';
const DV_COMP_MODE_KEY = 'fleet-ux:diff-viewer-comp-mode';
const DV_HIGHLIGHT_MODALITY_KEY = 'fleet-ux:diff-viewer-highlight-modality';
const DV_MAX_SLOTS = 6;
const DV_SLOT_WIDTH_PX = 440;
const DV_SLOT_GAP = 12;
const DV_SLOTS_AREA_PAD = 10;
const DV_REEL_PEEK_H = 14;
const DV_REEL_LENS_H = 220; // min height + CSS fallback for --dv-reel-lens-h
const DV_REEL_ROW_GAP = 10;
const DV_REEL_LENS_TOP = DV_REEL_PEEK_H + DV_REEL_ROW_GAP;
const DV_VERSION_SUBMITTED_CHROME = 17; // 10px * 1.3 line-height + 4px card-body gap
const DV_REEL_COPY_TOP = DV_REEL_LENS_TOP + DV_VERSION_SUBMITTED_CHROME;
const DV_REEL_VIEWPORT_H_EXPR = 'calc(' + (DV_REEL_PEEK_H * 2 + DV_REEL_ROW_GAP * 2) + 'px + var(--dv-reel-lens-h, ' + DV_REEL_LENS_H + 'px))';
const DV_REEL_COPY_RAIL_PAD = DV_REEL_COPY_TOP + 26 + 10; // copy top + icon height + nav gap
const DV_REEL_NAV_LABEL_H = 14;
const DV_REEL_NAV_ROW_GAP = 20; // peek band between up/down buttons and current label
const DV_REEL_NAV_ROW_H = DV_REEL_NAV_LABEL_H / 2 + DV_REEL_NAV_ROW_GAP / 2; // track step; centers peeks in gap
const DV_DRAG_THRESHOLD_PX = 4;

let _dvSlotSeq = 0;
let _dvLensSyncScheduled = false;
let _dvLensSyncAfterLayout = false;

// ── Module state ──

const _dvState = {
    mode: 'tasks',       // 'tasks' | 'free-text'
    granularity: 'word', // 'word' | 'char'
    compMode: 'base',    // 'base' | 'rolling'
    showHighlights: true,
    highlightModality: 'differences', // 'differences' | 'similarities'
    highlightMinLength: null,   // null = use highlightLengthRange.min
    highlightLengthRange: { min: 0, max: 0 },
    rollingLeft: 0,      // left index of rolling comparison pair
    slots: [],           // Array<DvSlot>
    stash: [],           // Array<DvStashEntry> — persisted
    freeBase: '',
    freeCompare: '',
    drag: _dvCreateEmptyDragState(),
    hoverSlotIdx: null,
    searchLoading: false,
    searchError: null
};

function _dvCreateEmptyDragState() {
    return {
        pending: false,
        active: false,
        fromIdx: null,
        overIdx: null,
        pointerId: null,
        offsetX: 0,
        offsetY: 0,
        startClientX: 0,
        startClientY: 0,
        ghost: null,
        placeholder: null,
        targetGhost: null,
        sourceWrap: null,
        sourceColumn: null,
        dimmedWrap: null,
        handleEl: null
    };
}

// DvSlot:   { slotId, taskId, key, authorName, authorEmail, createdAt, promptVersions, lensIndex, loading, error }
// DvStash:  { taskId, key, authorName, authorEmail, createdAt, versionCount? }

// ── Diff engine delegation (Context.diffEngine from diff-engine.js) ──

function _dvEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _dvCopyIconHtml(text) {
    const value = String(text == null ? '' : text);
    return '<button type="button" data-wf-dash-copy="' + _dvEscHtml(value) + '" title="Copy" aria-label="Copy" style="display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 6px; border: none; background: transparent; color: var(--muted-foreground, #64748b); cursor: pointer;">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
        + '</button>';
}

function _dvEngine() {
    return Context.diffEngine;
}

function _dvPlainPromptHtml(text) {
    const eng = _dvEngine();
    return eng ? eng.plainPromptHtml(text) : _dvEscHtml(text || '');
}

function _dvEffectiveHighlightMinLength() {
    if (!_dvState.showHighlights) return 0;
    const range = _dvState.highlightLengthRange;
    if (!range || range.max === 0) return 0;
    return _dvState.highlightMinLength != null ? _dvState.highlightMinLength : range.min;
}

function _dvHighlightLengthUnitLabel() {
    return _dvState.granularity === 'char' ? 'chars' : 'words';
}

function _dvComparisonPairsForLengthRange(modal) {
    if (_dvState.mode === 'free-text') {
        const baseInput = _dvQ(modal, 'dv-free-base-input');
        const compareInput = _dvQ(modal, 'dv-free-compare-input');
        return [{
            baseText: (baseInput && baseInput.value) || '',
            compareText: (compareInput && compareInput.value) || ''
        }];
    }
    const pairs = [];
    if (_dvState.mode !== 'tasks' || _dvState.slots.length < 2) return pairs;
    if (_dvState.compMode === 'rolling') {
        _dvClampRollingLeft();
        const left = _dvState.slots[_dvState.rollingLeft];
        const right = _dvState.slots[_dvState.rollingLeft + 1];
        if (left && right) {
            pairs.push({ baseText: _dvSlotPromptText(left), compareText: _dvSlotPromptText(right) });
        }
        return pairs;
    }
    const baseText = _dvSlotPromptText(_dvState.slots[0]);
    for (let i = 1; i < _dvState.slots.length; i++) {
        pairs.push({ baseText, compareText: _dvSlotPromptText(_dvState.slots[i]) });
    }
    return pairs;
}

function _dvRefreshHighlightLengthRange(modal) {
    const eng = _dvEngine();
    if (!eng || !_dvState.showHighlights) {
        _dvState.highlightLengthRange = { min: 0, max: 0 };
        _dvState.highlightMinLength = null;
        _dvSyncHighlightLengthUi(modal);
        return;
    }
    const pairs = _dvComparisonPairsForLengthRange(modal);
    let globalMin = Infinity;
    let globalMax = 0;
    const allLengths = [];
    const opts = { granularity: _dvState.granularity, highlightModality: _dvState.highlightModality };
    for (const pair of pairs) {
        const range = eng.highlightSectionLengthRange(pair.baseText, pair.compareText, opts);
        if (range.lengths.length) {
            globalMin = Math.min(globalMin, range.min);
            globalMax = Math.max(globalMax, range.max);
            allLengths.push(...range.lengths);
        }
    }
    if (!allLengths.length) {
        _dvState.highlightLengthRange = { min: 0, max: 0 };
        _dvState.highlightMinLength = null;
    } else {
        _dvState.highlightLengthRange = { min: globalMin, max: globalMax };
        if (_dvState.highlightMinLength == null || _dvState.highlightMinLength < globalMin) {
            _dvState.highlightMinLength = globalMin;
        } else if (_dvState.highlightMinLength > globalMax) {
            _dvState.highlightMinLength = globalMax;
        }
    }
    _dvSyncHighlightLengthUi(modal);
}

function _dvDiffPair(baseText, compareText, granularity) {
    const eng = _dvEngine();
    if (!eng) {
        return { baseHtml: _dvPlainPromptHtml(baseText), compareHtml: _dvPlainPromptHtml(compareText) };
    }
    return eng.diffPair(baseText, compareText, {
        granularity,
        showHighlights: _dvState.showHighlights,
        highlightModality: _dvState.highlightModality,
        minHighlightLength: _dvEffectiveHighlightMinLength()
    });
}

function _dvFormatCreatedAt(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function _dvRelativeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    const diffMs = Math.max(0, Date.now() - then.getTime());
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const parts = [];
    if (days > 0) parts.push(days + ' day' + (days === 1 ? '' : 's'));
    parts.push(hours + ' hour' + (hours === 1 ? '' : 's'));
    return parts.join(', ') + ' ago';
}

function _dvTaskInitialCreatedAt(taskCreatedAt, promptVersions) {
    const versions = promptVersions || [];
    if (versions.length) {
        const first = [...versions].sort((a, b) => a.displayVersionNo - b.displayVersionNo)[0];
        if (first && first.createdAt) return first.createdAt;
    }
    return taskCreatedAt || '';
}

function _dvTimestampLineHtml(prefixLabel, iso) {
    if (!iso) return '';
    const formatted = _dvFormatCreatedAt(iso);
    const ago = _dvRelativeAgo(iso);
    const dateSpan = `<span class="dv-timestamp-date">${_dvEscHtml(formatted)}</span>`;
    let html = prefixLabel
        ? `<span class="dv-timestamp-accent">${_dvEscHtml(prefixLabel)}</span> ${dateSpan}`
        : dateSpan;
    if (ago) html += ` <span class="dv-timestamp-accent">(${_dvEscHtml(ago)})</span>`;
    return html;
}

function _dvVersionCountHtml(count) {
    if (!count || count <= 0) return '';
    const label = count === 1 ? 'version' : 'versions';
    return `<span class="dv-slot-version-count"><span class="dv-version-count-num">${count}</span> <span class="dv-version-count-label">${label}</span></span>`;
}

function _dvSlotVersionCountHtml(slot) {
    const versions = slot.promptVersions;
    if (!versions || versions.length === 0) return '';
    return _dvVersionCountHtml(versions.length);
}

function _dvStashVersionCountHtml(entry) {
    const slot = _dvState.slots.find((s) => s.taskId === entry.taskId && s.promptVersions && s.promptVersions.length > 0);
    const count = slot ? slot.promptVersions.length : (entry.versionCount || 0);
    return _dvVersionCountHtml(count);
}

function _dvSlotMetaRowHtml(slot) {
    const createdHtml = slot.createdAt
        ? `<div class="dv-slot-created">${_dvTimestampLineHtml('', slot.createdAt)}</div>`
        : '';
    const versionHtml = _dvSlotVersionCountHtml(slot);
    if (!createdHtml && !versionHtml) return '';
    return `<div class="dv-slot-meta">${createdHtml}${versionHtml}</div>`;
}

// ── Stash persistence ──

function _dvLoadStash() {
    try {
        const raw = Storage.getData(DV_STASH_KEY, null);
        return raw ? JSON.parse(raw) : [];
    } catch (_e) { return []; }
}

function _dvSaveStash() {
    try { Storage.setData(DV_STASH_KEY, JSON.stringify(_dvState.stash)); } catch (_e) { /* no-op */ }
}

// ── Retrieve input parser (mirrors search-output._parseRetrieveInput) ──

const _DV_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _DV_TASK_KEY_RE = /^task_[A-Za-z0-9_]+$/;

function _dvParseInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const classify = (seg) => {
        if (!seg) return null;
        if (_DV_UUID_RE.test(seg)) return { kind: 'id', value: seg };
        if (_DV_TASK_KEY_RE.test(seg)) return { kind: 'key', value: seg };
        return null;
    };
    if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
        try {
            const url = new URL(text, 'https://www.fleetai.com');
            const segs = url.pathname.split('/').filter(Boolean).concat([...url.searchParams.values()]);
            for (const seg of segs) { const p = classify(seg); if (p) return p; }
        } catch (_e) { /* not a URL */ }
    }
    const direct = classify(text);
    if (direct) return direct;
    const uuidMatch = text.match(_DV_UUID_RE);
    if (uuidMatch) return { kind: 'id', value: uuidMatch[0] };
    const keyMatch = text.match(/task_[A-Za-z0-9_]+/);
    if (keyMatch) return { kind: 'key', value: keyMatch[0] };
    return null;
}

// ── Fetch & hydrate a task (direct PostgREST — never uses search-output cache gates) ──

function _dvFirstEmbed(embed) {
    if (!embed) return null;
    if (Array.isArray(embed)) return embed[0] || null;
    if (typeof embed === 'object') return embed;
    return null;
}

function _dvPersonChipName(profile, personId) {
    if (!profile) return '';
    const rawName = String(profile.full_name || '').trim();
    const id = String(personId || profile.id || '').trim();
    if (rawName && id && rawName.toLowerCase() === id.toLowerCase()) return '';
    return rawName;
}

function _dvBuildProfilesMap(profileRows) {
    const map = new Map();
    for (const p of profileRows) map.set(p.id, { full_name: p.full_name, email: p.email });
    return map;
}

async function _dvPgQuery(queryKey, overrides) {
    if (!Context.opsTab || typeof Context.opsTab.postgrestQuery !== 'function') {
        throw new Error('Ops dashboard PostgREST client unavailable. Unlock the Ops dashboard and try again.');
    }
    const rows = await Context.opsTab.postgrestQuery(queryKey, overrides || {});
    return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

async function _dvFetchProfilesByIds(profileIds) {
    const lib = Context.dashboardLib;
    if (!lib || typeof lib.pgInChunks !== 'function' || typeof lib.pgInFilter !== 'function') {
        throw new Error('Dashboard lib unavailable');
    }
    const chunks = lib.pgInChunks(profileIds);
    const all = [];
    for (const chunk of chunks) {
        const rows = await _dvPgQuery('profiles.select_person', { id: lib.pgInFilter(chunk) });
        all.push(...rows);
    }
    return all;
}

async function _dvFetchTaskRowForRetrieve(parsed) {
    if (parsed.kind === 'key') {
        const rows = await _dvPgQuery('tasks.select_search', { key: 'eq.' + parsed.value, limit: '1' });
        return { row: rows[0] || null, versionOverride: null };
    }
    let rows = await _dvPgQuery('tasks.select_search', { id: 'eq.' + parsed.value, limit: '1' });
    if (rows.length) return { row: rows[0], versionOverride: null };
    const versionRows = await _dvPgQuery('task_versions.select_history', { id: 'eq.' + parsed.value, limit: '1' });
    if (!versionRows.length) return { row: null, versionOverride: null };
    const versionRow = versionRows[0];
    const taskId = versionRow.task_id;
    if (!taskId) return { row: null, versionOverride: null };
    rows = await _dvPgQuery('tasks.select_search', { id: 'eq.' + taskId, limit: '1' });
    return { row: rows[0] || null, versionOverride: versionRow };
}

function _dvRowToTask(row, profilesMap, versionOverride) {
    const version = versionOverride || _dvFirstEmbed(row.eval_task_versions);
    const profile = profilesMap.get(row.created_by) || null;
    return {
        id: row.id,
        key: row.key || '',
        author: {
            id: row.created_by || '',
            name: profile ? _dvPersonChipName(profile, row.created_by) : '',
            email: (profile && profile.email) || ''
        }
    };
}

async function _dvFetchTask(raw) {
    const parsed = _dvParseInput(String(raw || '').trim());
    if (!parsed) throw new Error('Not a valid task ID, key, version ID, or URL');
    const { row, versionOverride } = await _dvFetchTaskRowForRetrieve(parsed);
    if (!row) throw new Error('Task not found');
    const profileRows = row.created_by ? await _dvFetchProfilesByIds([row.created_by]) : [];
    const profilesMap = _dvBuildProfilesMap(profileRows);
    const task = _dvRowToTask(row, profilesMap, versionOverride);
    if (!Context.dashboardData || typeof Context.dashboardData.enrichTasksWithHistory !== 'function') {
        throw new Error('Dashboard data layer unavailable');
    }
    const enriched = await Context.dashboardData.enrichTasksWithHistory(
        [task.id], profilesMap, { skipFeedbackFetch: true }
    );
    const taskData = enriched.get(task.id) || {};
    const promptVersions = taskData.promptVersions || [];
    return {
        taskId: task.id,
        key: task.key || '',
        authorName: (task.author && task.author.name) || '',
        authorEmail: (task.author && task.author.email) || '',
        createdAt: _dvTaskInitialCreatedAt(row.created_at || '', promptVersions),
        promptVersions
    };
}

// ── Stash management ──

function _dvStashFind(taskId) {
    return _dvState.stash.findIndex((s) => s.taskId === taskId);
}

function _dvAddToStash(entry) {
    const idx = _dvStashFind(entry.taskId);
    if (idx < 0) {
        _dvState.stash.push({
            taskId: entry.taskId,
            key: entry.key,
            authorName: entry.authorName,
            authorEmail: entry.authorEmail,
            createdAt: entry.createdAt || '',
            versionCount: entry.versionCount || 0
        });
        _dvSaveStash();
        Logger.log('diff-viewer: stash add — ' + (entry.key || entry.taskId));
    } else {
        let changed = false;
        if (entry.createdAt && !_dvState.stash[idx].createdAt) {
            _dvState.stash[idx].createdAt = entry.createdAt;
            changed = true;
        }
        if (entry.versionCount && entry.versionCount > (_dvState.stash[idx].versionCount || 0)) {
            _dvState.stash[idx].versionCount = entry.versionCount;
            changed = true;
        }
        if (changed) _dvSaveStash();
    }
}

function _dvClearStash(modal) {
    if (_dvState.stash.length === 0) return;
    const count = _dvState.stash.length;
    _dvState.stash = [];
    _dvState.slots = [];
    _dvSaveStash();
    _dvRenderAll(modal);
    Logger.log('diff-viewer: stash cleared — ' + count + ' item(s)');
}

function _dvRemoveFromStash(taskId, modal) {
    const idx = _dvStashFind(taskId);
    if (idx >= 0) {
        _dvState.stash.splice(idx, 1);
        _dvSaveStash();
        Logger.log('diff-viewer: stash remove — ' + taskId);
        _dvRenderStash(modal);
        _dvRenderStashChipStates(modal);
    }
}

function _dvRemoveTaskFromDiffAndStash(taskId, modal) {
    if (!taskId) return;
    let removedSlots = 0;
    for (let i = _dvState.slots.length - 1; i >= 0; i--) {
        if (_dvState.slots[i].taskId === taskId) {
            _dvState.slots.splice(i, 1);
            removedSlots += 1;
        }
    }
    _dvRemoveFromStash(taskId, modal);
    if (removedSlots > 0) _dvRenderAll(modal);
    Logger.log('diff-viewer: task removed from stash'
        + (removedSlots > 0 ? ' and ' + removedSlots + ' comparison slot(s)' : '')
        + ' — ' + taskId);
}

// ── Lens index resolution ──

function _dvNextLensIndex(taskId, promptVersions) {
    if (!promptVersions || promptVersions.length === 0) return 0;
    const taken = new Set(
        _dvState.slots
            .filter((s) => s.taskId === taskId && !s.loading && s.promptVersions)
            .map((s) => s.lensIndex)
    );
    for (let i = 0; i < promptVersions.length; i++) {
        if (!taken.has(i)) return i;
    }
    return null; // all versions occupied
}

// ── Slot management ──

function _dvAddSlot(seed, modal) {
    if (_dvState.slots.length >= DV_MAX_SLOTS) {
        Logger.log('diff-viewer: max slots (' + DV_MAX_SLOTS + ') reached');
        return;
    }
    const slotId = ++_dvSlotSeq;
    const slot = {
        slotId,
        taskId: seed.taskId || '',
        key: seed.key || '',
        authorName: seed.authorName || '',
        authorEmail: seed.authorEmail || '',
        createdAt: seed.createdAt || '',
        promptVersions: null,
        lensIndex: 0,
        loading: true,
        error: null
    };
    _dvState.slots.push(slot);
    if (seed.taskId) {
        _dvAddToStash({
            taskId: seed.taskId,
            key: seed.key,
            authorName: seed.authorName,
            authorEmail: seed.authorEmail,
            createdAt: seed.createdAt || ''
        });
    }
    _dvRenderAll(modal);
    void _dvHydrateSlot(slotId, seed, modal);
    _dvFlashTabAdded();
}

async function _dvHydrateSlot(slotId, seed, modal) {
    try {
        const lookup = seed.raw || seed.key || seed.taskId;
        if (!lookup) throw new Error('No task identifier to hydrate');
        const data = await _dvFetchTask(lookup);
        const slotIdx = _dvState.slots.findIndex((s) => s.slotId === slotId);
        if (slotIdx < 0) return; // slot was removed before hydration completed
        if (!modal.isConnected) return; // modal was rebuilt; drop stale update
        const slot = _dvState.slots[slotIdx];
        slot.taskId = data.taskId;
        slot.promptVersions = data.promptVersions;
        slot.authorName = data.authorName || slot.authorName;
        slot.authorEmail = data.authorEmail || slot.authorEmail;
        slot.key = data.key || slot.key;
        slot.createdAt = data.createdAt || slot.createdAt || '';
        slot.lensIndex = _dvNextLensIndex(data.taskId, data.promptVersions) ?? 0;
        slot.loading = false;
        _dvAddToStash({
            taskId: data.taskId,
            key: data.key,
            authorName: data.authorName,
            authorEmail: data.authorEmail,
            createdAt: slot.createdAt,
            versionCount: (data.promptVersions || []).length
        });
        Logger.log('diff-viewer: slot hydrated — ' + (data.key || data.taskId) + ' (' + (data.promptVersions || []).length + ' versions)');
        _dvRenderAll(modal);
    } catch (err) {
        const slotIdx = _dvState.slots.findIndex((s) => s.slotId === slotId);
        if (slotIdx < 0) return;
        _dvState.slots[slotIdx].loading = false;
        _dvState.slots[slotIdx].error = String(err && err.message || err || 'Unknown error');
        Logger.error('diff-viewer: slot hydration failed', err);
        _dvRenderAll(modal);
    }
}

function _dvRemoveSlot(slotIdx, modal) {
    if (slotIdx < 0 || slotIdx >= _dvState.slots.length) return;
    const removed = _dvState.slots.splice(slotIdx, 1)[0];
    const taskId = removed && removed.taskId;
    const stillInComparison = taskId && _dvState.slots.some((s) => s.taskId === taskId);
    if (taskId && !stillInComparison) {
        _dvRemoveFromStash(taskId, modal);
    }
    Logger.log('diff-viewer: slot removed from comparison'
        + (taskId && !stillInComparison ? ' and stash' : '')
        + ' — ' + (removed.key || removed.taskId));
    _dvRenderAll(modal);
}

function _dvMinimizeSlot(slotIdx, modal) {
    if (slotIdx < 0 || slotIdx >= _dvState.slots.length) return;
    const slot = _dvState.slots[slotIdx];
    _dvAddToStash({
        taskId: slot.taskId,
        key: slot.key,
        authorName: slot.authorName,
        authorEmail: slot.authorEmail,
        createdAt: slot.createdAt || '',
        versionCount: (slot.promptVersions || []).length
    });
    _dvState.slots.splice(slotIdx, 1);
    Logger.log('diff-viewer: slot minimized to stash — ' + (slot.key || slot.taskId));
    _dvRenderAll(modal);
}

const DV_ANIM_MS = 300;
const DV_ANIM_EASE = 'cubic-bezier(0.37, 0, 0.63, 1)';

function _dvParseTranslateY(el) {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
    return m ? parseFloat(m[2]) : 0;
}

function _dvMeasureNavRowH(track) {
    if (track && track._dvRowH) return track._dvRowH;
    return DV_REEL_NAV_ROW_H;
}

function _dvVersionTrackOffset(viewport, track, lensIndex) {
    const rowH = _dvMeasureNavRowH(track);
    const nav = viewport && viewport.closest('.dv-reel-arrows-nav');
    const slot = nav && nav.querySelector('.dv-reel-nav-current-slot');
    if (!slot || !viewport) return -lensIndex * rowH;
    const viewportRect = viewport.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const slotCenterY = slotRect.top + slotRect.height / 2 - viewportRect.top;
    const labelCenterY = lensIndex * rowH + rowH / 2;
    return slotCenterY - labelCenterY;
}

function _dvSyncVersionTrack(track, lensIndex) {
    const viewport = track && track.closest('.dv-reel-arrows-nav-viewport');
    if (!viewport) return;
    const y = _dvVersionTrackOffset(viewport, track, lensIndex);
    track.style.transform = 'translateY(' + y + 'px)';
}

function _dvSyncAllVersionTracks(modal) {
    if (!modal) return;
    for (let i = 0; i < _dvState.slots.length; i++) {
        const slot = _dvState.slots[i];
        if (!slot.promptVersions || slot.promptVersions.length === 0) continue;
        const track = modal.querySelector('[data-dv-version-track="' + i + '"]');
        if (!track) continue;
        track._dvRowH = null;
        _dvSyncVersionTrack(track, slot.lensIndex);
    }
}

function _dvReelLensZoneTopInset() {
    return DV_REEL_LENS_TOP;
}

function _dvReelLensH(slotsArea) {
    if (!slotsArea) return DV_REEL_LENS_H;
    const v = getComputedStyle(slotsArea).getPropertyValue('--dv-reel-lens-h').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : DV_REEL_LENS_H;
}

function _dvReelCardStepH(slotsArea) {
    return _dvReelLensH(slotsArea) + DV_REEL_ROW_GAP;
}

function _dvReelTrackOffset(lensIndex, slotsArea) {
    const stepH = _dvReelCardStepH(slotsArea);
    return _dvReelLensZoneTopInset() - lensIndex * stepH;
}

function _dvReelLensBounds(modal) {
    const slotsArea = modal && _dvQ(modal, 'dv-slots-area');
    const cardH = _dvReelLensH(slotsArea);
    const lensTop = _dvReelLensZoneTopInset();
    return {
        lensTop,
        lensBottom: lensTop + cardH,
        cardH,
        stepH: _dvReelCardStepH(slotsArea)
    };
}

function _dvReelContentOpacity(cardTop, cardBottom, bounds) {
    const overlapTop = Math.max(cardTop, bounds.lensTop);
    const overlapBottom = Math.min(cardBottom, bounds.lensBottom);
    const overlap = Math.max(0, overlapBottom - overlapTop);
    if (bounds.cardH <= 0) return 0;
    return Math.min(1, overlap / bounds.cardH);
}

function _dvApplyReelContentOpacities(track, translateY, modal) {
    if (!track || !modal) return;
    const bounds = _dvReelLensBounds(modal);
    track.querySelectorAll('.dv-reel-card').forEach((card, i) => {
        const cardTop = translateY + i * bounds.stepH;
        const cardBottom = cardTop + bounds.cardH;
        const opacity = _dvReelContentOpacity(cardTop, cardBottom, bounds);
        const content = card.querySelector('.dv-reel-card-body') || card.querySelector('.dv-reel-card-content');
        const target = content || card.querySelector('.dv-reel-empty-mark');
        if (target) target.style.opacity = String(opacity);
    });
}

function _dvSyncReelTrack(track, lensIndex, modal) {
    if (!track) return;
    const slotsArea = modal && _dvQ(modal, 'dv-slots-area');
    const y = _dvReelTrackOffset(lensIndex, slotsArea);
    track.style.transform = 'translateY(' + y + 'px)';
    _dvApplyReelContentOpacities(track, y, modal);
}

function _dvSyncAllReelTracks(modal) {
    if (!modal) return;
    for (let i = 0; i < _dvState.slots.length; i++) {
        const slot = _dvState.slots[i];
        if (!slot.promptVersions || slot.promptVersions.length === 0) continue;
        if (slot._lensAnimating) continue;
        const track = modal.querySelector('[data-dv-reel-track="' + i + '"]');
        if (!track) continue;
        _dvSyncReelTrack(track, slot.lensIndex, modal);
    }
}

function _dvAnimateReelTrack(track, delta, modal, done) {
    if (!track) {
        if (done) done();
        return;
    }
    const slotsArea = modal && _dvQ(modal, 'dv-slots-area');
    const stepH = _dvReelCardStepH(slotsArea);
    const fromY = _dvParseTranslateY(track);
    const toY = fromY - delta * stepH;
    if (typeof track.animate !== 'function') {
        track.style.transform = 'translateY(' + toY + 'px)';
        _dvApplyReelContentOpacities(track, toY, modal);
        if (done) done();
        return;
    }
    const animOpts = { duration: DV_ANIM_MS, easing: DV_ANIM_EASE, fill: 'forwards' };
    const anim = track.animate(
        [{ transform: 'translateY(' + fromY + 'px)' }, { transform: 'translateY(' + toY + 'px)' }],
        animOpts
    );
    let rafId = 0;
    const tick = () => {
        _dvApplyReelContentOpacities(track, _dvParseTranslateY(track), modal);
        if (anim.playState === 'running' || anim.playState === 'pending') {
            rafId = requestAnimationFrame(tick);
        }
    };
    rafId = requestAnimationFrame(tick);
    anim.addEventListener('finish', () => {
        cancelAnimationFrame(rafId);
        track.style.transform = 'translateY(' + toY + 'px)';
        _dvApplyReelContentOpacities(track, toY, modal);
        if (done) done();
    });
}

function _dvAnimateVersionTrack(track, viewport, delta, done) {
    if (!track) {
        if (done) done();
        return;
    }
    const rowH = _dvMeasureNavRowH(track);
    const fromY = _dvParseTranslateY(track);
    const toY = fromY - delta * rowH;
    if (typeof track.animate !== 'function') {
        track.style.transform = 'translateY(' + toY + 'px)';
        if (done) done();
        return;
    }
    const animOpts = { duration: DV_ANIM_MS, easing: DV_ANIM_EASE, fill: 'forwards' };
    track.animate(
        [{ transform: 'translateY(' + fromY + 'px)' }, { transform: 'translateY(' + toY + 'px)' }],
        animOpts
    ).addEventListener('finish', () => { if (done) done(); });
}

function _dvUpdateReelNavControls(slotIdx, modal) {
    const slot = _dvState.slots[slotIdx];
    if (!slot || !slot.promptVersions || !modal) return;
    const nav = modal.querySelector('[data-dv-arrows-nav="' + slotIdx + '"]');
    if (!nav) return;
    const lensIdx = slot.lensIndex;
    const versions = slot.promptVersions;
    const upBtn = nav.querySelector('[data-dv-lens-up="' + slotIdx + '"]');
    const downBtn = nav.querySelector('[data-dv-lens-down="' + slotIdx + '"]');
    if (upBtn) {
        upBtn.disabled = lensIdx <= 0;
        upBtn.classList.toggle('disabled', lensIdx <= 0);
    }
    if (downBtn) {
        downBtn.disabled = lensIdx >= versions.length - 1;
        downBtn.classList.toggle('disabled', lensIdx >= versions.length - 1);
    }
    const versionTrack = nav.querySelector('[data-dv-version-track="' + slotIdx + '"]');
    if (versionTrack) {
        versionTrack.querySelectorAll('.dv-reel-version-label').forEach((el) => {
            const vi = parseInt(el.getAttribute('data-vi'), 10);
            el.classList.toggle('dv-reel-version-label--current', vi === lensIdx);
        });
    }
    const reelTrack = modal.querySelector('[data-dv-reel-track="' + slotIdx + '"]');
    if (reelTrack) {
        reelTrack.querySelectorAll('.dv-reel-card pre').forEach((pre) => pre.removeAttribute('data-dv-lens-pre'));
        const card = reelTrack.querySelector('.dv-reel-card[data-vi="' + lensIdx + '"]');
        const pre = card && card.querySelector('pre');
        if (pre) pre.setAttribute('data-dv-lens-pre', String(slotIdx));
    }
}

function _dvShiftLens(slotIdx, delta, modal) {
    const slot = _dvState.slots[slotIdx];
    if (!slot || !slot.promptVersions || slot._lensAnimating) return;
    const newIdx = slot.lensIndex + delta;
    if (newIdx < 0 || newIdx >= slot.promptVersions.length) return;

    const reelTrack = modal && modal.querySelector('[data-dv-reel-track="' + slotIdx + '"]');
    const versionTrack = modal && modal.querySelector('[data-dv-version-track="' + slotIdx + '"]');
    const versionViewport = versionTrack && versionTrack.closest('.dv-reel-arrows-nav-viewport');

    if (!reelTrack || typeof reelTrack.animate !== 'function') {
        slot.lensIndex = newIdx;
        Logger.debug('diff-viewer: lens shift slot=' + slotIdx + ' delta=' + delta + ' → v' + (slot.promptVersions[newIdx].displayVersionNo));
        _dvRenderAll(modal);
        return;
    }

    slot._lensAnimating = true;
    let pending = 2;
    const finishOne = () => {
        pending -= 1;
        if (pending <= 0) {
            slot._lensAnimating = false;
            _dvSyncReelTrack(reelTrack, slot.lensIndex, modal);
            if (versionTrack) _dvSyncVersionTrack(versionTrack, slot.lensIndex);
            _dvUpdateReelNavControls(slotIdx, modal);
            _dvRenderDiffs(modal);
            _dvUpdateAboveLabels(modal);
        }
    };

    slot.lensIndex = newIdx;
    _dvAnimateReelTrack(reelTrack, delta, modal, finishOne);
    if (versionTrack) _dvAnimateVersionTrack(versionTrack, versionViewport, delta, finishOne);
    else finishOne();

    Logger.debug('diff-viewer: lens shift slot=' + slotIdx + ' delta=' + delta + ' → v' + slot.promptVersions[newIdx].displayVersionNo);
}

function _dvSwapSlots(fromIdx, toIdx, modal) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= _dvState.slots.length) return;
    if (toIdx < 0 || toIdx >= _dvState.slots.length) return;
    const tmp = _dvState.slots[fromIdx];
    _dvState.slots[fromIdx] = _dvState.slots[toIdx];
    _dvState.slots[toIdx] = tmp;
    Logger.log('diff-viewer: slot swap ' + fromIdx + ' ↔ ' + toIdx);
    _dvRenderAll(modal);
}

// ── Slot drag ghost UX ──

function _dvGetSlotColumn(modal, idx) {
    if (!modal || idx == null || idx < 0) return null;
    if (idx === 0) return _dvQ(modal, 'dv-base-container');
    const cols = modal.querySelectorAll('#dv-extra-container [data-dv-slot-column]');
    return cols[idx - 1] || null;
}

function _dvGetSlotWrap(modal, idx) {
    const col = _dvGetSlotColumn(modal, idx);
    if (!col) return null;
    if (idx === 0) {
        return col.querySelector('#dv-base-slot-inner') || col.querySelector('.dv-slot-wrap');
    }
    return col.querySelector('.dv-slot-wrap');
}

function _dvHitTestSlotIdx(modal, clientX, clientY, ghostEl) {
    if (!modal) return null;
    const prevVis = ghostEl ? ghostEl.style.visibility : '';
    if (ghostEl) ghostEl.style.visibility = 'hidden';
    const el = document.elementFromPoint(clientX, clientY);
    if (ghostEl) ghostEl.style.visibility = prevVis || '';
    if (!el || !modal.contains(el)) return null;
    const baseCol = el.closest('#dv-base-container');
    if (baseCol && modal.contains(baseCol)) return 0;
    const extraCol = el.closest('#dv-extra-container [data-dv-slot-column]');
    if (!extraCol || !modal.contains(extraCol)) return null;
    const cols = [...modal.querySelectorAll('#dv-extra-container [data-dv-slot-column]')];
    const idx = cols.indexOf(extraCol);
    return idx >= 0 ? idx + 1 : null;
}

function _dvClearTargetPreview(d) {
    if (d.targetGhost && d.targetGhost.parentNode) d.targetGhost.parentNode.removeChild(d.targetGhost);
    d.targetGhost = null;
    if (d.dimmedWrap) {
        d.dimmedWrap.style.opacity = '';
        d.dimmedWrap.style.visibility = '';
        d.dimmedWrap = null;
    }
}

function _dvUpdateTargetPreview(modal, d, overIdx) {
    if (overIdx == null || overIdx === d.fromIdx) {
        _dvClearTargetPreview(d);
        d.overIdx = overIdx;
        return;
    }
    if (d.overIdx === overIdx) return;
    _dvClearTargetPreview(d);
    d.overIdx = overIdx;

    const srcWrap = d.sourceWrap || _dvGetSlotWrap(modal, d.fromIdx);
    const tgtWrap = _dvGetSlotWrap(modal, overIdx);
    if (!srcWrap || !tgtWrap) return;

    const placeholderRect = d.placeholder && d.placeholder.getBoundingClientRect();
    const srcRect = (placeholderRect && placeholderRect.width > 0)
        ? placeholderRect
        : srcWrap.getBoundingClientRect();
    const tgtRect = tgtWrap.getBoundingClientRect();
    const preview = tgtWrap.cloneNode(true);
    preview.classList.add('dv-drag-target-preview');
    preview.removeAttribute('id');
    preview.style.position = 'fixed';
    preview.style.transition = 'none';
    preview.style.left = tgtRect.left + 'px';
    preview.style.top = tgtRect.top + 'px';
    preview.style.width = tgtRect.width + 'px';
    preview.style.height = tgtRect.height + 'px';
    preview.style.margin = '0';
    preview.style.pointerEvents = 'none';
    preview.style.zIndex = '2147483646';
    document.body.appendChild(preview);
    preview.getBoundingClientRect();
    preview.style.transition = 'left ' + DV_ANIM_MS + 'ms ' + DV_ANIM_EASE + ', top ' + DV_ANIM_MS + 'ms ' + DV_ANIM_EASE;
    preview.style.left = srcRect.left + 'px';
    preview.style.top = srcRect.top + 'px';
    d.targetGhost = preview;
    d.dimmedWrap = tgtWrap;
    tgtWrap.style.visibility = 'hidden';

    Logger.debug('diff-viewer: drag hover slot ' + overIdx + ' → preview at slot ' + d.fromIdx);
}

function _dvBeginDragActive(modal) {
    const d = _dvState.drag;
    const wrap = _dvGetSlotWrap(modal, d.fromIdx);
    const col = _dvGetSlotColumn(modal, d.fromIdx);
    if (!wrap || !col) {
        _dvEndDrag(modal, false);
        return;
    }

    const rect = wrap.getBoundingClientRect();
    const ghost = wrap.cloneNode(true);
    ghost.id = 'dv-drag-ghost';
    ghost.classList.add('dv-drag-ghost');
    ghost.querySelectorAll('[data-dv-drag]').forEach((h) => h.removeAttribute('data-dv-drag'));
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.margin = '0';
    document.body.appendChild(ghost);

    const placeholder = document.createElement('div');
    placeholder.className = 'dv-drag-placeholder';
    placeholder.style.minHeight = rect.height + 'px';
    placeholder.style.flex = '1';
    col.insertBefore(placeholder, wrap);
    wrap.style.display = 'none';

    d.active = true;
    d.pending = false;
    d.ghost = ghost;
    d.placeholder = placeholder;
    d.sourceWrap = wrap;
    d.sourceColumn = col;
    document.body.style.cursor = 'grabbing';
    Logger.log('diff-viewer: drag started — slot ' + d.fromIdx);
}

function _dvUpdateDragMove(modal, e) {
    const d = _dvState.drag;
    if (!d.active || !d.ghost) return;
    d.ghost.style.left = (e.clientX - d.offsetX) + 'px';
    d.ghost.style.top = (e.clientY - d.offsetY) + 'px';
    const overIdx = _dvHitTestSlotIdx(modal, e.clientX, e.clientY, d.ghost);
    _dvUpdateTargetPreview(modal, d, overIdx);
}

function _dvEndDrag(modal, commit) {
    const d = _dvState.drag;
    if (!d.pending && !d.active) return;

    const fromIdx = d.fromIdx;
    const overIdx = d.overIdx;
    const wasActive = d.active;
    const shouldSwap = commit && wasActive && overIdx != null && overIdx !== fromIdx;

    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    _dvClearTargetPreview(d);
    if (d.placeholder && d.placeholder.parentNode) d.placeholder.parentNode.removeChild(d.placeholder);
    if (d.sourceWrap) d.sourceWrap.style.display = '';
    if (d.handleEl) {
        try { d.handleEl.releasePointerCapture(d.pointerId); } catch (_e) { /* no-op */ }
        d.handleEl.style.cursor = '';
    }
    document.body.style.cursor = '';

    _dvState.drag = _dvCreateEmptyDragState();

    if (shouldSwap) _dvSwapSlots(fromIdx, overIdx, modal);
    else if (wasActive) Logger.debug('diff-viewer: drag cancelled or dropped on same slot');
}

function _dvAttachDragListeners(modal) {
    if (modal._dvDragListenersAttached) return;
    modal._dvDragListenersAttached = true;
    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        if (_dvState.drag.pending || _dvState.drag.active) return;
        if (e.target.closest('[data-dv-copy],[data-dv-copy-prompt],[data-dv-minimize],[data-dv-remove],[data-dv-lens-up],[data-dv-lens-down]')) return;
        const handle = e.target.closest('[data-dv-drag]');
        if (!handle || !modal.contains(handle)) return;

        const fromIdx = parseInt(handle.getAttribute('data-dv-drag'), 10);
        const wrap = _dvGetSlotWrap(modal, fromIdx);
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();

        _dvState.drag = Object.assign(_dvCreateEmptyDragState(), {
            pending: true,
            fromIdx,
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            startClientX: e.clientX,
            startClientY: e.clientY,
            handleEl: handle
        });
        handle.setPointerCapture(e.pointerId);
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        const d = _dvState.drag;
        if (!d.pending && !d.active) return;
        if (d.pointerId !== e.pointerId) return;
        if (!d.active) {
            const dx = e.clientX - d.startClientX;
            const dy = e.clientY - d.startClientY;
            if (Math.hypot(dx, dy) < DV_DRAG_THRESHOLD_PX) return;
            _dvBeginDragActive(modal);
        }
        _dvUpdateDragMove(modal, e);
    };

    const onPointerUp = (e) => {
        const d = _dvState.drag;
        if (!d.pending && !d.active) return;
        if (d.pointerId !== e.pointerId) return;
        _dvEndDrag(modal, true);
    };

    const onPointerCancel = (e) => {
        const d = _dvState.drag;
        if (!d.pending && !d.active) return;
        if (d.pointerId !== e.pointerId) return;
        _dvEndDrag(modal, false);
    };

    const onKeyDown = (e) => {
        if (e.key !== 'Escape') return;
        if (!_dvState.drag.pending && !_dvState.drag.active) return;
        _dvEndDrag(modal, false);
    };

    modal.addEventListener('pointerdown', onPointerDown);
    modal.addEventListener('pointermove', onPointerMove);
    modal.addEventListener('pointerup', onPointerUp);
    modal.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onKeyDown, true);
}

// ── Bulk actions ──

function _dvApplyViewProgression(modal) {
    if (_dvState.slots.length === 0) return;
    const base = _dvState.slots[0];
    if (!base.promptVersions) { Logger.warn('diff-viewer: base slot not hydrated yet'); return; }
    // Minimize all non-base slots
    for (let i = _dvState.slots.length - 1; i > 0; i--) _dvMinimizeSlot(i, null);
    // Add a slot for each version of the base task (capped at DV_MAX_SLOTS total)
    const maxExtra = DV_MAX_SLOTS - 1;
    const versions = base.promptVersions;
    if (versions.length > maxExtra + 1) {
        Logger.log('diff-viewer: View Progression — ' + versions.length + ' versions, capped to ' + DV_MAX_SLOTS + ' slots total');
    }
    for (let i = 1; i < versions.length && _dvState.slots.length < DV_MAX_SLOTS; i++) {
        const slotId = ++_dvSlotSeq;
        _dvState.slots.push({
            slotId,
            taskId: base.taskId, key: base.key,
            authorName: base.authorName, authorEmail: base.authorEmail,
            createdAt: base.createdAt || '',
            promptVersions: base.promptVersions,
            lensIndex: i, loading: false, error: null
        });
    }
    Logger.log('diff-viewer: View Complete Task Progression — ' + _dvState.slots.length + ' slots');
    _dvState.compMode = 'rolling';
    _dvState.rollingLeft = 0;
    try { Storage.setData(DV_COMP_MODE_KEY, 'rolling'); } catch (_e) { /* no-op */ }
    _dvRenderAll(modal);
    _dvSyncCompModeUi(modal);
    _dvUpdateRollingOverlay(modal);
}

function _dvApplyAllV1(modal) {
    _dvState.slots.forEach((s) => {
        if (s.promptVersions && s.promptVersions.length > 0) s.lensIndex = 0;
    });
    Logger.log('diff-viewer: All v1s applied');
    _dvRenderAll(modal);
}

function _dvApplyAllFinal(modal) {
    _dvState.slots.forEach((s) => {
        if (s.promptVersions && s.promptVersions.length > 0) s.lensIndex = s.promptVersions.length - 1;
    });
    Logger.log('diff-viewer: All final versions applied');
    _dvRenderAll(modal);
}

// ── Panel HTML (built once) ──

function _dvSegBtn(attrName, value, label, active, divider) {
    const divCls = divider ? ' dv-seg-btn--divider' : '';
    return `<button type="button" ${attrName}="${value}" class="dv-seg-btn${divCls}" aria-pressed="${active ? 'true' : 'false'}">${label}</button>`;
}

function _dvToggleCell(labelStyle, title, innerHtml) {
    return `<div class="dv-toggle-cell"><div style="${labelStyle}margin-bottom:6px;">${title}</div>${innerHtml}</div>`;
}

function _dvPanelHtml(dash) {
    const box = dash.panelBoxStyle ? dash.panelBoxStyle() : '';
    const label = dash.labelStyle ? dash.labelStyle() : 'font-size:11px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;letter-spacing:.04em;';
    const input = dash.inputStyle ? dash.inputStyle() : 'border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:6px 9px;font-size:13px;width:100%;box-sizing:border-box;background:var(--background,#fff);color:var(--foreground,#0f172a);';
    const btnClass = (variant, size) => (dash.dashBtnClass ? dash.dashBtnClass(variant, size) : 'wf-dash-btn wf-dash-btn--' + variant + ' wf-dash-btn--' + size);

    const gran = _dvState.granularity;
    const compMode = _dvState.compMode;
    const showHighlights = _dvState.showHighlights;
    const highlightModality = _dvState.highlightModality;

    const leftHtml = `
    <div style="${box}display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;gap:12px;">
        <div id="dv-universal-toggles" class="dv-universal-toggles">
            ${_dvToggleCell(label, 'Highlights', `<div class="dv-seg-group">${_dvSegBtn('data-dv-highlights', 'on', 'On', showHighlights, true)}${_dvSegBtn('data-dv-highlights', 'off', 'Off', !showHighlights, false)}</div>`)}
            ${_dvToggleCell(label, 'Type', `<div class="dv-seg-group">${_dvSegBtn('data-dv-mode', 'tasks', 'Tasks', _dvState.mode === 'tasks', true)}${_dvSegBtn('data-dv-mode', 'free-text', 'Free Text', _dvState.mode === 'free-text', false)}</div>`)}
            ${_dvToggleCell(label, 'Modality', `<div class="dv-seg-group">${_dvSegBtn('data-dv-highlight-modality', 'differences', 'Differences', highlightModality === 'differences', true)}${_dvSegBtn('data-dv-highlight-modality', 'similarities', 'Similarities', highlightModality === 'similarities', false)}</div>`)}
            ${_dvToggleCell(label, 'Granularity', `<div class="dv-seg-group">${_dvSegBtn('data-dv-seg', 'word', 'Word', gran === 'word', true)}${_dvSegBtn('data-dv-seg', 'char', 'Character', gran === 'char', false)}</div>`)}
            <div id="dv-highlight-length-wrap" class="dv-highlight-length-wrap" style="display:${showHighlights ? 'flex' : 'none'};">
                <div style="${label}margin-bottom:6px;">Min Highlight Length</div>
                <div class="dv-highlight-length-row">
                    <input type="range" id="dv-highlight-length-slider" min="0" max="0" step="1" value="0"
                           aria-label="Minimum highlight section length" disabled />
                    <span id="dv-highlight-length-readout" class="dv-highlight-length-readout"></span>
                </div>
            </div>
        </div>
        <div id="dv-tasks-controls" style="display:${_dvState.mode==='tasks'?'flex':'none'};flex-direction:column;gap:12px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;">
            <div id="dv-comp-mode-section" style="flex-shrink:0;">
                <div style="${label}margin-bottom:6px;">Mode</div>
                <div class="dv-seg-group">
                    ${_dvSegBtn('data-dv-comp-mode', 'base', 'Base Comparison', compMode === 'base', true)}
                    ${_dvSegBtn('data-dv-comp-mode', 'rolling', 'Rolling Comparison', compMode === 'rolling', false)}
                </div>
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
                <div style="${label}">Actions</div>
                <button type="button" data-dv-action="progression" class="${btnClass('basic', 'nav')} wf-dash-btn--full" style="text-align:left;" title="Set each slot to a successive version of the base task">View Complete Task Progression</button>
                <div style="display:flex;gap:6px;">
                    <button type="button" data-dv-action="all-v1" class="${btnClass('basic', 'nav')}" style="flex:1;">All v1s</button>
                    <button type="button" data-dv-action="all-final" class="${btnClass('basic', 'nav')}" style="flex:1;">All final versions</button>
                </div>
            </div>
            <div style="flex-shrink:0;">
                <div style="${label}margin-bottom:6px;">Add task</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <input id="dv-search-input" type="text" placeholder="Task ID, key, URL, version ID…" style="${input}flex:1;"/>
                    <button id="dv-search-btn" type="button" class="${btnClass('primary', 'nav')}" style="flex-shrink:0;">Add</button>
                </div>
                <div id="dv-search-error" style="display:none;font-size:11px;color:#dc2626;margin-top:4px;"></div>
            </div>
            <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-shrink:0;gap:8px;">
                    <div style="${label}">Stash</div>
                    <button type="button" id="dv-stash-clear" data-dv-stash-clear class="${btnClass('basic', 'nav')}" style="flex-shrink:0;padding:2px 8px;font-size:10px;line-height:1.4;" disabled>Clear</button>
                </div>
                <div id="dv-stash-chips" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;">
                    <div style="font-size:11px;color:var(--muted-foreground,#64748b);padding:4px 0;">No tasks in stash.</div>
                </div>
            </div>
        </div>
    </div>`;

    const rightHtml = `
    <div id="dv-right" class="${showHighlights ? '' : 'dv-highlights-off'}" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">
        <div id="dv-slots-area" class="dv-slots-area${_dvState.compMode==='rolling'?' dv-slots-area--rolling':''}" style="display:${_dvState.mode==='tasks'?'flex':'none'};">
            <div class="dv-slots-stack">
                <div id="dv-slots-above-label" class="dv-slot-above-label" aria-hidden="true"></div>
                <div id="dv-slots-columns-row" class="dv-slots-columns-row">
                    <div id="dv-base-container" class="dv-slot-column dv-slot-column--base" data-dv-slot-column="0">
                        <div id="dv-base-slot-inner" class="dv-slot-wrap"></div>
                    </div>
                    <div id="dv-extra-container" class="dv-slot-columns-extra"></div>
                </div>
            </div>
        </div>
        <div id="dv-free-area" style="display:${_dvState.mode==='free-text'?'flex':'none'};flex:1;flex-direction:column;overflow:hidden;min-height:0;">
            <div style="flex:0 0 40%;display:flex;gap:8px;padding:8px;min-height:0;box-sizing:border-box;">
                <div style="flex:1;display:flex;flex-direction:column;min-height:0;gap:4px;">
                    <div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;">Base</div>
                    <textarea id="dv-free-base-input" placeholder="Paste base text here…" style="flex:1;resize:none;font-family:monospace;font-size:11px;padding:8px;border:1px solid var(--border,#e2e8f0);border-radius:6px;background:var(--background,#fff);color:var(--foreground,#0f172a);line-height:1.5;box-sizing:border-box;"></textarea>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;min-height:0;gap:4px;">
                    <div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;">Compare</div>
                    <textarea id="dv-free-compare-input" placeholder="Paste compare text here…" style="flex:1;resize:none;font-family:monospace;font-size:11px;padding:8px;border:1px solid var(--border,#e2e8f0);border-radius:6px;background:var(--background,#fff);color:var(--foreground,#0f172a);line-height:1.5;box-sizing:border-box;"></textarea>
                </div>
            </div>
            <div style="flex:1;display:flex;gap:8px;padding:8px;overflow:hidden;min-height:0;box-sizing:border-box;">
                <div style="flex:1;display:flex;flex-direction:column;min-height:0;gap:4px;">
                    <div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;">Base (removals)</div>
                    <pre id="dv-free-base-diff" style="flex:1;margin:0;overflow:auto;padding:8px;background:var(--muted,rgba(0,0,0,0.04));border-radius:6px;white-space:pre-wrap;font-size:11px;line-height:1.5;word-break:break-word;min-height:0;"></pre>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;min-height:0;gap:4px;">
                    <div style="font-size:10px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;">Compare (additions)</div>
                    <pre id="dv-free-compare-diff" style="flex:1;margin:0;overflow:auto;padding:8px;background:var(--muted,rgba(0,0,0,0.04));border-radius:6px;white-space:pre-wrap;font-size:11px;line-height:1.5;word-break:break-word;min-height:0;"></pre>
                </div>
            </div>
        </div>
    </div>`;

    return _dvSplitPanelSection(dash, leftHtml, rightHtml);
}

function _dvSplitPanelSection(dash, leftHtml, rightHtml) {
    if (dash && typeof dash._splitPanelSectionHtml === 'function') {
        return dash._splitPanelSectionHtml(leftHtml, rightHtml, 'diff-viewer');
    }
    Logger.warn('diff-viewer: split panel unavailable — side panel will not be resizable');
    return `<div style="display:flex;flex:1;min-height:0;overflow:hidden;width:100%;">${leftHtml}${rightHtml}</div>`;
}

// ── Slot card HTML ──

function _dvKeyCopyHtml(key, taskId) {
    const value = String(key || taskId || '').trim();
    if (!value) return '<span class="dv-slot-key-copy dv-slot-key-copy--empty">—</span>';
    return `<button type="button" class="dv-slot-key-copy dv-slot-key-copy--primary" data-dv-copy="${_dvEscHtml(value)}" title="Click to copy task key">${_dvEscHtml(value)}</button>`;
}

async function _dvCopyText(text) {
    const value = String(text || '');
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch (_e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    }
}

function _dvFlashCopySuccess(el) {
    if (el._dvCopyTimeout) clearTimeout(el._dvCopyTimeout);
    const prevBg = el.style.backgroundColor;
    const prevColor = el.style.color;
    const prevBorder = el.style.borderColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    el.style.backgroundColor = 'rgb(34, 197, 94)';
    el.style.color = '#ffffff';
    el.style.borderColor = 'rgb(34, 197, 94)';
    el._dvCopyTimeout = setTimeout(() => {
        el.style.backgroundColor = prevBg;
        el.style.color = prevColor;
        el.style.borderColor = prevBorder;
        el.style.transition = prevTransition;
        el._dvCopyTimeout = null;
    }, 1000);
}

function _dvFlashCopyFail(el) {
    if (el._dvCopyTimeout) clearTimeout(el._dvCopyTimeout);
    const prevBg = el.style.backgroundColor;
    const prevColor = el.style.color;
    const prevBorder = el.style.borderColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    el.style.backgroundColor = 'rgb(239, 68, 68)';
    el.style.color = '#ffffff';
    el.style.borderColor = 'rgb(239, 68, 68)';
    void el.offsetWidth;
    el.style.transition = 'background-color 500ms ease-out, color 500ms ease-out, border-color 500ms ease-out';
    el._dvCopyTimeout = setTimeout(() => {
        el.style.backgroundColor = prevBg;
        el.style.color = prevColor;
        el.style.borderColor = prevBorder;
        el.style.transition = prevTransition;
        el._dvCopyTimeout = null;
    }, 500);
}

async function _dvCopyWithFeedback(el, text, logLabel) {
    const label = logLabel || 'task key';
    const value = String(text == null ? '' : text).trim();
    if (!value) {
        _dvFlashCopyFail(el);
        Logger.warn('diff-viewer: copy skipped (empty ' + label + ')');
        return false;
    }
    const ok = await _dvCopyText(value);
    if (ok) {
        _dvFlashCopySuccess(el);
        Logger.log('diff-viewer: copied ' + label + ' (' + value.length + ' chars)');
    } else {
        _dvFlashCopyFail(el);
        Logger.warn('diff-viewer: copy ' + label + ' failed');
    }
    return ok;
}

function _dvCopyIconSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
}

function _dvReelUnifiedChromeH() {
    let chrome = 12;
    chrome += (DV_REEL_PEEK_H + DV_REEL_ROW_GAP) * 2;
    return chrome;
}

function _dvAboveLabelInnerHtml() {
    if (!_dvState.showHighlights) return '';
    const pair = _dvActiveCompareTexts();
    if (!pair) return '';
    const eng = _dvEngine();
    if (!eng) return '';
    return eng.similarityLabelHtml({
        leftText: pair.leftText,
        rightText: pair.rightText,
        granularity: _dvState.granularity,
        highlightModality: _dvState.highlightModality,
        showHighlights: _dvState.showHighlights,
        minHighlightLength: _dvEffectiveHighlightMinLength(),
        lengthRange: _dvState.highlightLengthRange
    });
}

function _dvSetAboveLabelEl(el, inner) {
    if (!el) return;
    el.innerHTML = inner;
    el.style.display = 'flex';
    if (inner) {
        el.removeAttribute('aria-hidden');
    } else {
        el.setAttribute('aria-hidden', 'true');
    }
}

function _dvUpdateAboveLabels(modal) {
    if (!modal) return;
    _dvSetAboveLabelEl(_dvQ(modal, 'dv-slots-above-label'), _dvAboveLabelInnerHtml());
}

function _dvActiveCompareTexts() {
    if (_dvState.mode !== 'tasks' || _dvState.slots.length < 2) return null;
    if (_dvState.compMode === 'rolling') {
        _dvClampRollingLeft();
        const left = _dvState.slots[_dvState.rollingLeft];
        const right = _dvState.slots[_dvState.rollingLeft + 1];
        if (!left || !right) return null;
        return { leftText: _dvSlotPromptText(left), rightText: _dvSlotPromptText(right) };
    }
    if (_dvState.slots.length === 2) {
        return { leftText: _dvSlotPromptText(_dvState.slots[0]), rightText: _dvSlotPromptText(_dvState.slots[1]) };
    }
    if (_dvState.hoverSlotIdx != null && _dvState.hoverSlotIdx > 0) {
        return {
            leftText: _dvSlotPromptText(_dvState.slots[0]),
            rightText: _dvSlotPromptText(_dvState.slots[_dvState.hoverSlotIdx])
        };
    }
    return null;
}

function _dvSlotHtml(slot, slotIdx, slotCount) {
    const authorDisplay = slot.authorName
        ? _dvEscHtml(slot.authorName) + (slot.authorEmail ? ' · ' + _dvEscHtml(slot.authorEmail) : '')
        : _dvEscHtml(slot.authorEmail || '—');
    const keyCopyHtml = _dvKeyCopyHtml(slot.key, slot.taskId);
    const authorHtml = authorDisplay
        ? `<div class="dv-slot-author" title="${_dvEscHtml(slot.authorName || '') + (slot.authorEmail ? ' · ' + _dvEscHtml(slot.authorEmail) : '')}">${authorDisplay}</div>`
        : '';
    const createdHtml = _dvSlotMetaRowHtml(slot);

    const btnStyle = 'width:22px;height:22px;padding:0;border:none;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
    const minimizeBtn = `<button type="button" data-dv-minimize="${slotIdx}" title="Minimize to stash" style="${btnStyle}background:var(--muted,rgba(0,0,0,0.08));color:var(--muted-foreground,#64748b);">−</button>`;
    const removeBtn = `<button type="button" data-dv-remove="${slotIdx}" title="Remove from comparison and stash" aria-label="Remove from comparison and stash" style="${btnStyle}background:#fee2e2;color:#dc2626;">×</button>`;

    let bodyHtml = '';
    if (slot.loading) {
        bodyHtml = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted-foreground,#64748b);padding:16px;">Loading…</div>`;
    } else if (slot.error) {
        bodyHtml = `<div style="flex:1;padding:12px;font-size:11px;color:#dc2626;overflow-y:auto;">${_dvEscHtml(slot.error)}</div>`;
    } else if (slot.promptVersions && slot.promptVersions.length > 0) {
        bodyHtml = _dvReelHtml(slot, slotIdx);
    } else {
        bodyHtml = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted-foreground,#64748b);padding:16px;">No versions available</div>`;
    }

    return `<div class="dv-slot" data-dv-slot="${slotIdx}" style="display:flex;flex-direction:column;height:100%;overflow:hidden;box-sizing:border-box;">
        <div class="dv-slot-header" data-dv-drag="${slotIdx}" style="padding:8px 10px;background:var(--card,#fff);border-bottom:1px solid var(--border,#e2e8f0);cursor:grab;flex-shrink:0;display:flex;align-items:flex-start;gap:8px;user-select:none;">
            <div style="flex:1;min-width:0;overflow:hidden;">
                ${keyCopyHtml}
                ${authorHtml}
                ${createdHtml}
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">${minimizeBtn}${removeBtn}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;">${bodyHtml}</div>
    </div>`;
}

function _dvReelVersionTrackLabel(v, vi, isCurrent) {
    const cls = 'dv-reel-version-label' + (isCurrent ? ' dv-reel-version-label--current' : '');
    return '<span class="' + cls + '" data-vi="' + vi + '">v' + _dvEscHtml(String(v.displayVersionNo)) + '</span>';
}

function _dvReelVersionTrackHtml(slot, slotIdx) {
    const versions = slot.promptVersions || [];
    const lensIdx = slot.lensIndex;
    return versions.map((v, i) => _dvReelVersionTrackLabel(v, i, i === lensIdx)).join('');
}

function _dvReelArrowBtn(slotIdx, dir, enabled) {
    return '<button type="button" data-dv-lens-' + dir + '="' + slotIdx + '"'
        + ' title="' + (dir === 'up' ? 'Previous' : 'Next') + ' version"'
        + ' class="dv-reel-arrow wf-dash-btn wf-dash-btn--basic wf-dash-btn--icon"'
        + (enabled ? '' : ' disabled') + '>'
        + (dir === 'up' ? '↑' : '↓') + '</button>';
}

function _dvReelArrowsNavHtml(slot, slotIdx) {
    const versions = slot.promptVersions || [];
    const lensIdx = slot.lensIndex;
    const canUp = lensIdx > 0;
    const canDown = lensIdx < versions.length - 1;
    return '<div class="dv-reel-arrows-nav" data-dv-arrows-nav="' + slotIdx + '">'
        + '<div class="dv-reel-arrows-nav-viewport">'
        + '<div class="dv-reel-arrows-nav-track" data-dv-version-track="' + slotIdx + '">'
        + _dvReelVersionTrackHtml(slot, slotIdx)
        + '</div></div>'
        + '<div class="dv-reel-arrows-nav-controls">'
        + _dvReelArrowBtn(slotIdx, 'up', canUp)
        + '<div class="dv-reel-nav-current-slot" aria-hidden="true"></div>'
        + _dvReelArrowBtn(slotIdx, 'down', canDown)
        + '</div></div>';
}

function _dvReelCardInnerHtml(slotIdx, version, isCurrent) {
    const submittedInner = version && version.createdAt
        ? _dvTimestampLineHtml('', version.createdAt)
        : '';
    const prompt = version ? _dvEscHtml(version.prompt || '') : '';
    const preAttr = isCurrent ? ' data-dv-lens-pre="' + slotIdx + '"' : '';
    return '<div class="dv-reel-card-body">'
        + '<div class="dv-version-submitted">' + submittedInner + '</div>'
        + '<div class="dv-reel-card-prompt"><div class="dv-reel-card-content"><pre' + preAttr + '>' + prompt + '</pre></div>'
        + '</div>'
        + '</div>';
}

function _dvReelCardTrackHtml(slot, slotIdx) {
    const versions = slot.promptVersions || [];
    const lensIdx = slot.lensIndex;
    if (versions.length === 0) {
        return '<div class="dv-reel-card"><div class="dv-reel-card-prompt"><span class="dv-reel-empty-mark">—</span></div></div>';
    }
    return versions.map((v, i) => (
        '<div class="dv-reel-card" data-vi="' + i + '">' + _dvReelCardInnerHtml(slotIdx, v, i === lensIdx) + '</div>'
    )).join('');
}

function _dvReelHtml(slot, slotIdx) {
    const copyPromptBtn = `<button type="button" data-dv-copy-prompt="${slotIdx}" title="Copy prompt" aria-label="Copy prompt" class="dv-reel-copy wf-dash-btn wf-dash-btn--basic wf-dash-btn--icon">${_dvCopyIconSvg()}</button>`;

    return `<div class="dv-reel">
        <div class="dv-reel-viewport" data-dv-reel-viewport="${slotIdx}">
            <div class="dv-reel-track" data-dv-reel-track="${slotIdx}">
                ${_dvReelCardTrackHtml(slot, slotIdx)}
            </div>
        </div>
        <div class="dv-reel-arrows">
            ${copyPromptBtn}
            ${_dvReelArrowsNavHtml(slot, slotIdx)}
        </div>
    </div>`;
}

function _dvEmptySlotPlaceholder() {
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;color:var(--muted-foreground,#64748b);">
        <div style="font-size:13px;font-weight:500;">No base task</div>
        <div style="font-size:11px;text-align:center;">Search for a task or click a stash chip to add it here</div>
    </div>`;
}

// ── DOM render functions ──

function _dvQ(modal, id) {
    return modal ? modal.querySelector('#' + id) : null;
}

function _dvRenderAll(modal) {
    if (!modal) return;
    _dvRenderSlotsArea(modal);
    _dvRenderStash(modal);
    _dvRenderDiffs(modal);
    _dvRenderStashChipStates(modal);
    _dvScheduleReelLensSync(modal);
    _dvSyncCompModeUi(modal);
    _dvUpdateRollingOverlay(modal);
}

function _dvRenderSlotsArea(modal) {
    const baseContainer = _dvQ(modal, 'dv-base-container');
    const baseInner = _dvQ(modal, 'dv-base-slot-inner');
    const extraContainer = _dvQ(modal, 'dv-extra-container');
    if (!baseInner || !extraContainer) return;

    _dvState.hoverSlotIdx = null;

    if (_dvState.slots.length === 0) {
        if (baseContainer) baseContainer.style.display = '';
        baseInner.innerHTML = _dvEmptySlotPlaceholder();
        extraContainer.innerHTML = '';
        return;
    }

    if (baseContainer) baseContainer.style.display = '';
    baseInner.innerHTML = _dvSlotHtml(_dvState.slots[0], 0, _dvState.slots.length);
    let extraHtml = '';
    for (let i = 1; i < _dvState.slots.length; i++) {
        extraHtml += `<div class="dv-slot-column" data-dv-slot-column="${i}"><div class="dv-slot-wrap">${_dvSlotHtml(_dvState.slots[i], i, _dvState.slots.length)}</div></div>`;
    }
    extraContainer.innerHTML = extraHtml;
}

function _dvStashChipHtml(entry, idx, active) {
    const authorLine = entry.authorName
        ? _dvEscHtml(entry.authorName) + (entry.authorEmail ? ' · ' + _dvEscHtml(entry.authorEmail) : '')
        : _dvEscHtml(entry.authorEmail || '—');
    const keyLine = _dvEscHtml(entry.key || entry.taskId.slice(0, 12) + '…');
    const authorHtml = authorLine
        ? `<div class="dv-slot-author" title="${authorLine}">${authorLine}</div>`
        : '';
    const createdHtml = entry.createdAt
        ? `<div class="dv-slot-created">${_dvTimestampLineHtml('', entry.createdAt)}</div>`
        : '';
    const versionHtml = _dvStashVersionCountHtml(entry);
    const metaHtml = (createdHtml || versionHtml)
        ? `<div class="dv-slot-meta">${createdHtml}${versionHtml}</div>`
        : '';
    const removeBtnStyle = 'width:22px;height:22px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--muted-foreground,#64748b);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
    return `<div class="dv-stash-chip${active ? ' dv-stash-chip--active' : ''}" data-dv-stash-chip="${idx}" title="Click to add slot">
        <div class="dv-stash-chip-main">
            <div class="dv-stash-key">${keyLine}</div>
            ${authorHtml}
            ${metaHtml}
        </div>
        <button type="button" data-dv-stash-remove="${idx}" title="Remove from stash and diff view" style="${removeBtnStyle}">×</button>
    </div>`;
}

function _dvRenderStash(modal) {
    const chips = _dvQ(modal, 'dv-stash-chips');
    if (!chips) return;
    if (_dvState.stash.length === 0) {
        chips.innerHTML = `<div style="font-size:11px;color:var(--muted-foreground,#64748b);padding:4px 0;">No tasks in stash.</div>`;
        _dvSyncStashClearUi(modal);
        return;
    }
    const slotCountByTaskId = new Map();
    for (const s of _dvState.slots) {
        slotCountByTaskId.set(s.taskId, (slotCountByTaskId.get(s.taskId) || 0) + 1);
    }
    chips.innerHTML = _dvState.stash.map((entry, idx) => (
        _dvStashChipHtml(entry, idx, slotCountByTaskId.has(entry.taskId))
    )).join('');
    _dvSyncStashClearUi(modal);
}

function _dvSyncStashClearUi(modal) {
    const btn = _dvQ(modal, 'dv-stash-clear');
    if (btn) btn.disabled = _dvState.stash.length === 0;
}

function _dvRenderStashChipStates(modal) {
    const chips = _dvQ(modal, 'dv-stash-chips');
    if (!chips) return;
    const slotTaskIds = new Set(_dvState.slots.map((s) => s.taskId));
    chips.querySelectorAll('[data-dv-stash-chip]').forEach((chip) => {
        const idx = parseInt(chip.getAttribute('data-dv-stash-chip'), 10);
        const entry = _dvState.stash[idx];
        if (!entry) return;
        const active = slotTaskIds.has(entry.taskId);
        chip.classList.toggle('dv-stash-chip--active', active);
        const versionEl = chip.querySelector('.dv-slot-version-count');
        if (versionEl) {
            versionEl.outerHTML = _dvStashVersionCountHtml(entry);
        }
    });
}

// ── Diff rendering ──

function _dvClampRollingLeft() {
    const max = Math.max(0, _dvState.slots.length - 2);
    _dvState.rollingLeft = Math.max(0, Math.min(_dvState.rollingLeft, max));
}

function _dvSlotPromptText(slot) {
    if (!slot || !slot.promptVersions || slot.loading) return '';
    const v = slot.promptVersions[slot.lensIndex];
    return (v && v.prompt) || '';
}

function _dvRenderDiffs(modal) {
    if (_dvState.mode !== 'tasks') return;
    _dvRefreshHighlightLengthRange(modal);
    if (_dvState.slots.length < 2) {
        _dvRemoveRollingOverlay(modal);
        const basePre = modal.querySelector('[data-dv-lens-pre="0"]');
        if (basePre) _dvSetBaseLensHtml(basePre, _dvPlainPromptHtml(_dvSlotPromptText(_dvState.slots[0])), null);
        _dvUpdateAboveLabels(modal);
        _dvScheduleReelLensSync(modal);
        return;
    }

    if (_dvState.compMode === 'rolling') {
        _dvClampRollingLeft();
        const leftIdx = _dvState.rollingLeft;
        const rightIdx = leftIdx + 1;
        const leftSlot = _dvState.slots[leftIdx];
        const rightSlot = _dvState.slots[rightIdx];
        const leftText = _dvSlotPromptText(leftSlot);
        const rightText = _dvSlotPromptText(rightSlot);
        const { baseHtml, compareHtml } = _dvDiffPair(leftText, rightText, _dvState.granularity);

        for (let i = 0; i < _dvState.slots.length; i++) {
            const slot = _dvState.slots[i];
            if (!slot.promptVersions || slot.loading) continue;
            const lensPre = modal.querySelector('[data-dv-lens-pre="' + i + '"]');
            if (!lensPre) continue;
            if (i === leftIdx) {
                if (leftIdx === 0) _dvSetBaseLensHtml(lensPre, baseHtml, null);
                else lensPre.innerHTML = baseHtml;
            } else if (i === rightIdx) {
                lensPre.innerHTML = compareHtml;
            } else {
                lensPre.innerHTML = _dvPlainPromptHtml(_dvSlotPromptText(slot));
            }
        }
        _dvUpdateAboveLabels(modal);
        _dvScheduleReelLensSync(modal);
        return;
    }

    const base = _dvState.slots[0];
    if (!base || !base.promptVersions) return;
    const baseText = _dvSlotPromptText(base);
    const twoSlots = _dvState.slots.length === 2;

    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (twoSlots) {
        const compare = _dvState.slots[1];
        if (compare && compare.promptVersions && !compare.loading) {
            const compareText = _dvSlotPromptText(compare);
            const { baseHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
            if (baseLensPre) _dvSetBaseLensHtml(baseLensPre, baseHtml, null);
        } else if (baseLensPre) {
            _dvSetBaseLensHtml(baseLensPre, _dvPlainPromptHtml(baseText), null);
        }
    } else if (baseLensPre) {
        _dvSetBaseLensHtml(baseLensPre, _dvPlainPromptHtml(baseText), null);
    }

    for (let i = 1; i < _dvState.slots.length; i++) {
        const slot = _dvState.slots[i];
        if (!slot.promptVersions || slot.loading) continue;
        const compareText = _dvSlotPromptText(slot);
        const { compareHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
        const lensPre = modal.querySelector('[data-dv-lens-pre="' + i + '"]');
        if (lensPre) lensPre.innerHTML = compareHtml;
    }
    _dvUpdateAboveLabels(modal);
    _dvScheduleReelLensSync(modal);
}

function _dvSetBaseLensHtml(baseLensPre, html, hoverSrc) {
    if (!baseLensPre) return;
    baseLensPre.innerHTML = html;
    if (hoverSrc == null) baseLensPre.removeAttribute('data-dv-hover-src');
    else baseLensPre.setAttribute('data-dv-hover-src', String(hoverSrc));
}

function _dvClearCompareHoverRing(modal) {
    if (!modal) return;
    modal.querySelectorAll('.dv-slot-wrap--compare-hover').forEach((el) => {
        el.classList.remove('dv-slot-wrap--compare-hover');
    });
}

function _dvApplyCompareHoverRing(slotIdx, modal) {
    if (!_dvState.showHighlights || _dvState.compMode !== 'base' || slotIdx === 0) return;
    _dvClearCompareHoverRing(modal);
    const wrap = _dvGetSlotWrap(modal, slotIdx);
    if (wrap) wrap.classList.add('dv-slot-wrap--compare-hover');
}

function _dvApplyHoverDiff(slotIdx, modal) {
    if (!_dvState.showHighlights || _dvState.compMode !== 'base' || _dvState.slots.length <= 2 || slotIdx === 0) return;
    const base = _dvState.slots[0];
    const compare = _dvState.slots[slotIdx];
    if (!base || !base.promptVersions || !compare || !compare.promptVersions) return;
    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (baseLensPre && baseLensPre.getAttribute('data-dv-hover-src') === String(slotIdx)) return;
    const baseText = _dvSlotPromptText(base);
    const compareText = _dvSlotPromptText(compare);
    const { baseHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
    _dvSetBaseLensHtml(baseLensPre, baseHtml, slotIdx);
}

function _dvClearHoverDiff(modal) {
    if (_dvState.compMode !== 'base' || _dvState.slots.length <= 2) {
        _dvClearCompareHoverRing(modal);
        return;
    }
    const base = _dvState.slots[0];
    if (!base || !base.promptVersions) return;
    const baseText = _dvSlotPromptText(base);
    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (baseLensPre && !baseLensPre.hasAttribute('data-dv-hover-src')) {
        _dvClearCompareHoverRing(modal);
        return;
    }
    _dvSetBaseLensHtml(baseLensPre, _dvPlainPromptHtml(baseText), null);
    _dvClearCompareHoverRing(modal);
}

function _dvRemoveRollingOverlay(modal) {
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    if (!slotsArea) return;
    const overlay = slotsArea.querySelector('.dv-rolling-overlay');
    if (overlay) overlay.remove();
}

function _dvUpdateRollingOverlay(modal) {
    if (!modal || !_dvState.showHighlights || _dvState.mode !== 'tasks' || _dvState.compMode !== 'rolling' || _dvState.slots.length < 2) {
        _dvRemoveRollingOverlay(modal);
        return;
    }

    _dvClampRollingLeft();
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    if (!slotsArea) return;

    const leftWrap = _dvGetSlotWrap(modal, _dvState.rollingLeft);
    const rightWrap = _dvGetSlotWrap(modal, _dvState.rollingLeft + 1);
    if (!leftWrap || !rightWrap) {
        _dvRemoveRollingOverlay(modal);
        return;
    }

    const areaRect = slotsArea.getBoundingClientRect();
    const leftRect = leftWrap.getBoundingClientRect();
    const rightRect = rightWrap.getBoundingClientRect();
    const left = Math.min(leftRect.left, rightRect.left) - areaRect.left;
    const top = Math.min(leftRect.top, rightRect.top) - areaRect.top;
    const right = Math.max(leftRect.right, rightRect.right) - areaRect.left;
    const bottom = Math.max(leftRect.bottom, rightRect.bottom) - areaRect.top;

    let overlay = slotsArea.querySelector('.dv-rolling-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'dv-rolling-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        slotsArea.appendChild(overlay);
    }

    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    overlay.style.width = Math.max(0, right - left) + 'px';
    overlay.style.height = Math.max(0, bottom - top) + 'px';
}

function _dvScheduleReelLensSync(modal, opts) {
    const afterLayout = Boolean(opts && opts.afterLayout);
    if (!modal) return;
    if (_dvLensSyncScheduled) {
        if (afterLayout) _dvLensSyncAfterLayout = true;
        return;
    }
    _dvLensSyncScheduled = true;

    const finish = () => {
        _dvLensSyncScheduled = false;
        _dvLensSyncAfterLayout = false;
        _dvSyncReelLensHeights(modal);
        _dvSyncAllVersionTracks(modal);
    };

    requestAnimationFrame(() => {
        requestAnimationFrame(finish);
    });
}

// INVARIANT: reel lens height is derived ONLY from .dv-slots-columns-row.clientHeight.
// Never measure column/wrap parents for lens height — overflow-x on slot columns
// breaks height propagation. Lens budget uses .dv-slots-columns-row only.
// Rolling mode scrolls the row (all slots); base mode scrolls extra-container only.
function _dvSlotLensBudget(slotEl, unifiedChrome) {
    const header = slotEl.querySelector('.dv-slot-header');
    const headerH = header ? header.offsetHeight : 0;
    const row = slotEl.closest('.dv-slots-columns-row');
    if (!row) return null;
    return row.clientHeight - headerH - unifiedChrome;
}

function _dvSyncReelLensHeights(modal) {
    if (!modal || _dvState.mode !== 'tasks' || _dvState.slots.length === 0) return;
    if (_dvState.drag.pending || _dvState.drag.active) return;

    const slotsArea = _dvQ(modal, 'dv-slots-area');
    if (!slotsArea) return;

    const row = _dvQ(modal, 'dv-slots-columns-row');
    const rowH = row ? row.clientHeight : 0;
    if (rowH <= 0) {
        _dvLensSyncScheduled = false;
        _dvScheduleReelLensSync(modal, { afterLayout: true });
        return;
    }

    slotsArea.style.removeProperty('--dv-reel-lens-h');
    void slotsArea.offsetHeight;

    const slots = [...modal.querySelectorAll('.dv-slot')];
    const cards = [...modal.querySelectorAll('.dv-reel-card')];
    if (cards.length === 0) return;

    const scrollTops = _dvState.slots.map((slot, i) => {
        const track = modal.querySelector('[data-dv-reel-track="' + i + '"]');
        const card = track && track.querySelector('.dv-reel-card[data-vi="' + slot.lensIndex + '"]');
        const content = card && card.querySelector('.dv-reel-card-content');
        return content ? content.scrollTop : 0;
    });
    const unifiedChrome = _dvReelUnifiedChromeH();

    let maxBudget = Infinity;
    for (const slotEl of slots) {
        const budget = _dvSlotLensBudget(slotEl, unifiedChrome);
        if (budget == null) continue;
        if (Number.isFinite(budget)) maxBudget = Math.min(maxBudget, budget);
    }
    if (!Number.isFinite(maxBudget) || maxBudget <= 0) maxBudget = DV_REEL_LENS_H;

    let unified = Math.max(0, Math.floor(maxBudget));
    if (unified < DV_REEL_LENS_H && maxBudget < DV_REEL_LENS_H) {
        Logger.debug('diff-viewer: lens height budget below floor — ' + Math.round(maxBudget) + 'px');
    }

    const maxHeaderH = Math.max(0, ...slots.map((s) => {
        const h = s.querySelector('.dv-slot-header');
        return h ? h.offsetHeight : 0;
    }));
    const saneMax = rowH - maxHeaderH - unifiedChrome;
    if (unified < DV_REEL_LENS_H && saneMax >= DV_REEL_LENS_H) {
        Logger.warn('diff-viewer: lens budget suspiciously small — using sane max');
        unified = Math.floor(saneMax);
    }
    if (unified < DV_REEL_LENS_H) unified = Math.max(unified, Math.min(DV_REEL_LENS_H, saneMax));

    slotsArea.style.setProperty('--dv-reel-lens-h', unified + 'px');
    _dvState.slots.forEach((slot, i) => {
        const track = modal.querySelector('[data-dv-reel-track="' + i + '"]');
        const card = track && track.querySelector('.dv-reel-card[data-vi="' + slot.lensIndex + '"]');
        const content = card && card.querySelector('.dv-reel-card-content');
        if (content) content.scrollTop = scrollTops[i] || 0;
        if (track && !slot._lensAnimating) _dvSyncReelTrack(track, slot.lensIndex, modal);
    });
    if (_dvState.compMode === 'rolling') _dvUpdateRollingOverlay(modal);
    Logger.debug('diff-viewer: reel lens height synced — ' + unified + 'px (budget=' + Math.round(maxBudget) + ', chrome=' + unifiedChrome + ')');
}

function _dvAttachReelLensResizeObserver(modal) {
    if (!modal || modal._dvSlotsAreaRo) return;
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    if (!slotsArea || typeof ResizeObserver === 'undefined') return;
    modal._dvSlotsAreaRo = new ResizeObserver(() => {
        _dvScheduleReelLensSync(modal);
        if (_dvState.compMode === 'rolling') _dvUpdateRollingOverlay(modal);
    });
    modal._dvSlotsAreaRo.observe(slotsArea);
}

function _dvAttachRollingOverlayListeners(modal) {
    if (!modal || modal._dvRollingListenersAttached) return;
    const row = _dvQ(modal, 'dv-slots-columns-row');
    const extra = _dvQ(modal, 'dv-extra-container');
    if (!row && !extra) return;
    modal._dvRollingListenersAttached = true;
    const onScroll = () => {
        if (_dvState.compMode === 'rolling') _dvUpdateRollingOverlay(modal);
    };
    if (row) row.addEventListener('scroll', onScroll, { passive: true });
    if (extra) extra.addEventListener('scroll', onScroll, { passive: true });
}

function _dvRenderFreeTextDiff(modal) {
    const baseInput = _dvQ(modal, 'dv-free-base-input');
    const compareInput = _dvQ(modal, 'dv-free-compare-input');
    const baseDiff = _dvQ(modal, 'dv-free-base-diff');
    const compareDiff = _dvQ(modal, 'dv-free-compare-diff');
    if (!baseInput || !compareInput || !baseDiff || !compareDiff) return;
    _dvRefreshHighlightLengthRange(modal);
    const baseText = baseInput.value || '';
    const compareText = compareInput.value || '';
    if (!baseText && !compareText) {
        baseDiff.innerHTML = '';
        compareDiff.innerHTML = '';
        return;
    }
    const { baseHtml, compareHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
    baseDiff.innerHTML = baseHtml;
    compareDiff.innerHTML = compareHtml;
}

// ── Sidebar UI sync ──

function _dvSyncModeUi(modal) {
    const tasks = _dvQ(modal, 'dv-tasks-controls');
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    const freeArea = _dvQ(modal, 'dv-free-area');
    const isTask = _dvState.mode === 'tasks';
    if (tasks) tasks.style.display = isTask ? 'flex' : 'none';
    if (slotsArea) slotsArea.style.display = isTask ? 'flex' : 'none';
    if (freeArea) freeArea.style.display = isTask ? 'none' : 'flex';
    modal.querySelectorAll('[data-dv-mode]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-mode') === _dvState.mode;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function _dvSyncGranularityUi(modal) {
    modal.querySelectorAll('[data-dv-seg]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-seg') === _dvState.granularity;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function _dvSyncHighlightModalityUi(modal) {
    if (!modal) return;
    modal.querySelectorAll('[data-dv-highlight-modality]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-highlight-modality') === _dvState.highlightModality;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function _dvSyncCompModeUi(modal) {
    if (!modal) return;
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    if (slotsArea) {
        slotsArea.classList.toggle('dv-slots-area--rolling', _dvState.compMode === 'rolling');
    }
    _dvUpdateAboveLabels(modal);
    modal.querySelectorAll('[data-dv-comp-mode]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-comp-mode') === _dvState.compMode;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (_dvState.compMode !== 'rolling') _dvRemoveRollingOverlay(modal);
}

function _dvSyncHighlightLengthUi(modal) {
    if (!modal) return;
    const wrap = _dvQ(modal, 'dv-highlight-length-wrap');
    const slider = _dvQ(modal, 'dv-highlight-length-slider');
    const readout = _dvQ(modal, 'dv-highlight-length-readout');
    if (!wrap || !slider) return;
    if (!_dvState.showHighlights) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = 'flex';
    const range = _dvState.highlightLengthRange;
    const unit = _dvHighlightLengthUnitLabel();
    if (!range || range.max === 0) {
        slider.disabled = true;
        slider.min = '0';
        slider.max = '0';
        slider.value = '0';
        if (readout) readout.textContent = 'No highlight sections';
        return;
    }
    const current = _dvState.highlightMinLength != null ? _dvState.highlightMinLength : range.min;
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.value = String(current);
    slider.disabled = range.min === range.max;
    if (readout) readout.textContent = '≥ ' + current + ' ' + unit;
}

function _dvSyncHighlightsUi(modal) {
    if (!modal) return;
    const right = _dvQ(modal, 'dv-right');
    if (right) right.classList.toggle('dv-highlights-off', !_dvState.showHighlights);
    modal.querySelectorAll('[data-dv-highlights]').forEach((btn) => {
        const on = btn.getAttribute('data-dv-highlights') === 'on';
        btn.setAttribute('aria-pressed', on === _dvState.showHighlights ? 'true' : 'false');
    });
    _dvSyncHighlightLengthUi(modal);
    if (!_dvState.showHighlights) _dvRemoveRollingOverlay(modal);
}

function _dvSetSearchLoading(modal, loading, error) {
    _dvState.searchLoading = loading;
    _dvState.searchError = error || null;
    const btn = _dvQ(modal, 'dv-search-btn');
    const inp = _dvQ(modal, 'dv-search-input');
    const errEl = _dvQ(modal, 'dv-search-error');
    if (btn) { btn.textContent = loading ? 'Adding…' : 'Add'; btn.disabled = loading; }
    if (inp) inp.disabled = loading;
    if (errEl) {
        errEl.textContent = error ? 'Error: ' + error : '';
        errEl.style.display = error ? 'block' : 'none';
    }
}

// ── Event listeners ──

function _dvAttachListeners(modal, dash) {
    // ── Mode toggle ──
    modal.addEventListener('click', (e) => {
        const copyEl = e.target.closest('[data-dv-copy]');
        if (copyEl && modal.contains(copyEl)) {
            e.stopPropagation();
            void _dvCopyWithFeedback(copyEl, copyEl.getAttribute('data-dv-copy'));
            return;
        }

        const copyPromptEl = e.target.closest('[data-dv-copy-prompt]');
        if (copyPromptEl && modal.contains(copyPromptEl)) {
            e.stopPropagation();
            const slotIdx = parseInt(copyPromptEl.getAttribute('data-dv-copy-prompt'), 10);
            const slot = Number.isFinite(slotIdx) ? _dvState.slots[slotIdx] : null;
            void _dvCopyWithFeedback(copyPromptEl, _dvSlotPromptText(slot), 'prompt');
            return;
        }

        const modeBtn = e.target.closest('[data-dv-mode]');
        if (modeBtn && modal.contains(modeBtn)) {
            const mode = modeBtn.getAttribute('data-dv-mode');
            if (mode !== _dvState.mode) {
                _dvState.mode = mode;
                _dvSyncModeUi(modal);
                if (mode === 'free-text') {
                    _dvRenderFreeTextDiff(modal);
                } else {
                    _dvRenderDiffs(modal);
                    _dvUpdateRollingOverlay(modal);
                    _dvLensSyncScheduled = false;
                    _dvScheduleReelLensSync(modal, { afterLayout: true });
                }
                Logger.log('diff-viewer: mode → ' + mode);
            }
            return;
        }

        // ── Granularity toggle ──
        const segBtn = e.target.closest('[data-dv-seg]');
        if (segBtn && modal.contains(segBtn)) {
            const gran = segBtn.getAttribute('data-dv-seg');
            if (gran !== _dvState.granularity) {
                _dvState.granularity = gran;
                try { Storage.setData(DV_GRANULARITY_KEY, gran); } catch (_e) { /* no-op */ }
                _dvSyncGranularityUi(modal);
                _dvRenderDiffs(modal);
                _dvUpdateAboveLabels(modal);
                if (_dvState.mode === 'free-text') _dvRenderFreeTextDiff(modal);
                Logger.log('diff-viewer: granularity → ' + gran);
            }
            return;
        }

        // ── Highlight modality toggle ──
        const modalityBtn = e.target.closest('[data-dv-highlight-modality]');
        if (modalityBtn && modal.contains(modalityBtn)) {
            const modality = modalityBtn.getAttribute('data-dv-highlight-modality');
            if (modality !== _dvState.highlightModality) {
                _dvState.highlightModality = modality;
                try { Storage.setData(DV_HIGHLIGHT_MODALITY_KEY, modality); } catch (_e) { /* no-op */ }
                _dvSyncHighlightModalityUi(modal);
                _dvRenderDiffs(modal);
                _dvUpdateAboveLabels(modal);
                if (_dvState.mode === 'free-text') _dvRenderFreeTextDiff(modal);
                Logger.log('diff-viewer: highlight modality → ' + modality);
            }
            return;
        }

        // ── Comparison mode toggle ──
        const compBtn = e.target.closest('[data-dv-comp-mode]');
        if (compBtn && modal.contains(compBtn)) {
            const compMode = compBtn.getAttribute('data-dv-comp-mode');
            if (compMode !== _dvState.compMode) {
                _dvState.compMode = compMode;
                if (compMode === 'rolling') _dvClampRollingLeft();
                try { Storage.setData(DV_COMP_MODE_KEY, compMode); } catch (_e) { /* no-op */ }
                _dvClearHoverDiff(modal);
                _dvState.hoverSlotIdx = null;
                _dvSyncCompModeUi(modal);
                _dvRenderSlotsArea(modal);
                _dvRenderDiffs(modal);
                _dvUpdateRollingOverlay(modal);
                _dvLensSyncScheduled = false;
                _dvScheduleReelLensSync(modal, { afterLayout: true });
                Logger.log('diff-viewer: comp mode → ' + compMode);
            }
            return;
        }

        // ── Diff highlights toggle ──
        const highlightsBtn = e.target.closest('[data-dv-highlights]');
        if (highlightsBtn && modal.contains(highlightsBtn)) {
            const enabled = highlightsBtn.getAttribute('data-dv-highlights') === 'on';
            if (enabled !== _dvState.showHighlights) {
                _dvState.showHighlights = enabled;
                _dvState.hoverSlotIdx = null;
                _dvClearHoverDiff(modal);
                _dvSyncHighlightsUi(modal);
                _dvRenderDiffs(modal);
                _dvUpdateAboveLabels(modal);
                if (_dvState.mode === 'free-text') _dvRenderFreeTextDiff(modal);
                Logger.log('diff-viewer: highlights → ' + (enabled ? 'on' : 'off'));
            }
            return;
        }

        // ── Slot minimize ──
        const minimizeBtn = e.target.closest('[data-dv-minimize]');
        if (minimizeBtn && modal.contains(minimizeBtn)) {
            const idx = parseInt(minimizeBtn.getAttribute('data-dv-minimize'), 10);
            _dvMinimizeSlot(idx, modal);
            return;
        }

        // ── Slot remove ──
        const removeBtn = e.target.closest('[data-dv-remove]');
        if (removeBtn && modal.contains(removeBtn)) {
            const idx = parseInt(removeBtn.getAttribute('data-dv-remove'), 10);
            _dvRemoveSlot(idx, modal);
            return;
        }

        // ── Lens up/down ──
        const lensUp = e.target.closest('[data-dv-lens-up]');
        if (lensUp && modal.contains(lensUp) && !lensUp.disabled) {
            const idx = parseInt(lensUp.getAttribute('data-dv-lens-up'), 10);
            _dvShiftLens(idx, -1, modal);
            return;
        }
        const lensDown = e.target.closest('[data-dv-lens-down]');
        if (lensDown && modal.contains(lensDown) && !lensDown.disabled) {
            const idx = parseInt(lensDown.getAttribute('data-dv-lens-down'), 10);
            _dvShiftLens(idx, +1, modal);
            return;
        }

        // ── Bulk action buttons ──
        const actionBtn = e.target.closest('[data-dv-action]');
        if (actionBtn && modal.contains(actionBtn)) {
            const action = actionBtn.getAttribute('data-dv-action');
            if (action === 'progression') _dvApplyViewProgression(modal);
            else if (action === 'all-v1') _dvApplyAllV1(modal);
            else if (action === 'all-final') _dvApplyAllFinal(modal);
            return;
        }

        // ── Stash chip click (add slot) ──
        const stashChip = e.target.closest('[data-dv-stash-chip]');
        if (stashChip && modal.contains(stashChip) && !e.target.closest('[data-dv-stash-remove]')) {
            const idx = parseInt(stashChip.getAttribute('data-dv-stash-chip'), 10);
            const entry = _dvState.stash[idx];
            if (entry) {
                _dvAddSlot({
                    taskId: entry.taskId,
                    key: entry.key,
                    authorName: entry.authorName,
                    authorEmail: entry.authorEmail,
                    createdAt: entry.createdAt || ''
                }, modal);
            }
            return;
        }

        // ── Stash clear ──
        const stashClear = e.target.closest('[data-dv-stash-clear]');
        if (stashClear && modal.contains(stashClear)) {
            e.stopPropagation();
            _dvClearStash(modal);
            return;
        }

        // ── Stash remove ──
        const stashRemove = e.target.closest('[data-dv-stash-remove]');
        if (stashRemove && modal.contains(stashRemove)) {
            e.stopPropagation();
            const idx = parseInt(stashRemove.getAttribute('data-dv-stash-remove'), 10);
            const entry = _dvState.stash[idx];
            if (entry) _dvRemoveTaskFromDiffAndStash(entry.taskId, modal);
            return;
        }
    });

    // ── Search bar: add task ──
    const searchBtn = _dvQ(modal, 'dv-search-btn');
    const searchInput = _dvQ(modal, 'dv-search-input');
    const doSearch = () => {
        const val = searchInput ? searchInput.value.trim() : '';
        const dashLog = Context.dashboard;
        if (!val) {
            if (dashLog && typeof dashLog.logApiSkip === 'function') dashLog.logApiSkip('diff-add-task', 'empty input');
            return;
        }
        if (!_dvParseInput(val)) {
            if (dashLog && typeof dashLog.logApiSkip === 'function') dashLog.logApiSkip('diff-add-task', 'invalid input', val);
            _dvSetSearchLoading(modal, false, 'Not a valid task ID, key, version ID, or URL');
            return;
        }
        if (dashLog && typeof dashLog.logApiClick === 'function') dashLog.logApiClick('diff-add-task', val);
        _dvSetSearchLoading(modal, false, null);
        if (searchInput) searchInput.value = '';
        _dvAddSlot({ raw: val }, modal);
        Logger.log('diff-viewer: search add queued — ' + val);
    };
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    }

    // ── Free-text diff: live update ──
    const freeBaseInput = _dvQ(modal, 'dv-free-base-input');
    const freeCompareInput = _dvQ(modal, 'dv-free-compare-input');
    let _dvFreeDebounce = null;
    const onFreeInput = () => {
        clearTimeout(_dvFreeDebounce);
        _dvFreeDebounce = setTimeout(() => _dvRenderFreeTextDiff(modal), 120);
    };
    if (freeBaseInput) freeBaseInput.addEventListener('input', onFreeInput);
    if (freeCompareInput) freeCompareInput.addEventListener('input', onFreeInput);

    const lengthSlider = _dvQ(modal, 'dv-highlight-length-slider');
    if (lengthSlider && !modal._dvLengthSliderAttached) {
        modal._dvLengthSliderAttached = true;
        lengthSlider.addEventListener('input', () => {
            const val = parseInt(lengthSlider.value, 10);
            if (!Number.isFinite(val)) return;
            _dvState.highlightMinLength = val;
            _dvSyncHighlightLengthUi(modal);
            _dvRenderDiffs(modal);
            _dvUpdateAboveLabels(modal);
            if (_dvState.mode === 'free-text') _dvRenderFreeTextDiff(modal);
            Logger.log('diff-viewer: highlight min length → ' + val);
        });
    }

    // ── Drag & swap (ghost UX) ──
    _dvAttachDragListeners(modal);

    _dvAttachReelLensResizeObserver(modal);
    _dvAttachRollingOverlayListeners(modal);

    // ── Hover diffs (base mode) / rolling pair shift (rolling mode) ──
    modal.addEventListener('mouseover', (e) => {
        if (_dvState.mode !== 'tasks' || _dvState.slots.length < 2) return;
        const slot = e.target.closest('[data-dv-slot]');
        if (!slot || !modal.contains(slot)) return;
        const idx = parseInt(slot.getAttribute('data-dv-slot'), 10);
        const related = e.relatedTarget;
        if (related instanceof Node && slot.contains(related)) return;

        if (_dvState.compMode === 'rolling') {
            const rollingRight = _dvState.rollingLeft + 1;
            if (idx >= _dvState.rollingLeft && idx <= rollingRight) return;
            const prevLeft = _dvState.rollingLeft;
            if (idx < _dvState.rollingLeft) _dvState.rollingLeft = idx;
            else if (idx > rollingRight) _dvState.rollingLeft = idx - 1;
            _dvClampRollingLeft();
            if (_dvState.rollingLeft === prevLeft) return;
            _dvRenderDiffs(modal);
            _dvUpdateRollingOverlay(modal);
            Logger.debug('diff-viewer: rolling pair → slots ' + _dvState.rollingLeft + '–' + (_dvState.rollingLeft + 1));
            return;
        }

        if (idx <= 0) return;
        if (_dvState.hoverSlotIdx === idx) return;
        _dvState.hoverSlotIdx = idx;
        _dvApplyCompareHoverRing(idx, modal);
        if (_dvState.slots.length > 2) _dvApplyHoverDiff(idx, modal);
        _dvUpdateAboveLabels(modal);
    });

    modal.addEventListener('mouseout', (e) => {
        if (_dvState.compMode !== 'base' || _dvState.slots.length < 2) return;
        const slot = e.target.closest('[data-dv-slot]');
        if (!slot || !modal.contains(slot)) return;
        const idx = parseInt(slot.getAttribute('data-dv-slot'), 10);
        if (idx <= 0) return;
        const related = e.relatedTarget;
        if (related instanceof Node && slot.contains(related)) return;
        _dvState.hoverSlotIdx = null;
        _dvClearHoverDiff(modal);
        _dvUpdateAboveLabels(modal);
    });
}

// ── Inject styles (card action + dv-specific) ──

function _dvInjectStyles() {
    let style = document.getElementById('dv-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'dv-styles';
        document.head.appendChild(style);
    }
    style.textContent = [
        '@keyframes dvDiffTabAddPulse {',
        '  0% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '  12% {',
        '    background-color: color-mix(in srgb, rgb(34, 197, 94) 30%, transparent);',
        '    box-shadow: inset 0 -3px 0 0 rgb(34, 197, 94);',
        '    color: rgb(34, 197, 94) !important;',
        '    border-bottom-color: rgb(34, 197, 94) !important;',
        '  }',
        '  100% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '}',
        '#wf-dash-modal [data-wf-dash-tab="diff-viewer"].wf-dash-tab--add-pulse {',
        '  animation: dvDiffTabAddPulse 600ms cubic-bezier(0.22, 1, 0.36, 1) 1;',
        '}',
        '#wf-dash-modal .dv-universal-toggles {',
        '  display: flex;',
        '  flex-direction: row;',
        '  flex-wrap: wrap;',
        '  gap: 12px;',
        '  flex-shrink: 0;',
        '}',
        '#wf-dash-modal .dv-highlight-length-wrap {',
        '  flex-basis: 100%;',
        '  flex-direction: column;',
        '  gap: 0;',
        '}',
        '#wf-dash-modal .dv-highlight-length-row {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 10px;',
        '}',
        '#wf-dash-modal .dv-highlight-length-row input[type="range"] {',
        '  flex: 1;',
        '  min-width: 0;',
        '  accent-color: var(--brand, #2563eb);',
        '}',
        '#wf-dash-modal .dv-highlight-length-readout {',
        '  flex-shrink: 0;',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  color: var(--muted-foreground, #64748b);',
        '  min-width: 72px;',
        '  text-align: right;',
        '}',
        '#wf-dash-modal .dv-toggle-cell {',
        '  flex-shrink: 0;',
        '}',
        '#wf-dash-modal .dv-seg-group {',
        '  display: inline-flex;',
        '  border-radius: 6px;',
        '  overflow: hidden;',
        '  border: 1px solid var(--border, #475569);',
        '  background: color-mix(in srgb, var(--foreground, #e2e8f0) 6%, var(--card, #1e293b));',
        '}',
        '#wf-dash-modal .dv-seg-btn {',
        '  padding: 5px 12px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border: none;',
        '  cursor: pointer;',
        '  background: transparent;',
        '  color: var(--foreground, #e2e8f0);',
        '  transition: background-color 0.15s, color 0.15s;',
        '  line-height: 1.4;',
        '}',
        '#wf-dash-modal .dv-seg-btn--divider {',
        '  border-right: 1px solid var(--border, #475569);',
        '}',
        '#wf-dash-modal .dv-seg-btn[aria-pressed="true"] {',
        '  background: var(--brand, #2563eb);',
        '  color: #ffffff;',
        '}',
        '#wf-dash-modal .dv-seg-btn:not([aria-pressed="true"]):hover {',
        '  background: color-mix(in srgb, var(--foreground, #e2e8f0) 10%, transparent);',
        '  color: var(--foreground, #f8fafc);',
        '}',
        '#wf-dash-modal [data-dv-drag] { cursor: grab; }',
        '#wf-dash-modal [data-dv-drag]:active { cursor: grabbing; }',
        '#wf-dash-modal .dv-drag-placeholder {',
        '  border: 2px dashed var(--border, #475569);',
        '  border-radius: 8px;',
        '  background: color-mix(in srgb, var(--foreground, #e2e8f0) 4%, transparent);',
        '  opacity: 0.5;',
        '  box-sizing: border-box;',
        '  flex: 1;',
        '  min-height: 0;',
        '}',
        '#dv-drag-ghost {',
        '  position: fixed;',
        '  pointer-events: none;',
        '  z-index: 2147483647;',
        '  opacity: 0.88;',
        '  transform: rotate(1.5deg);',
        '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);',
        '  border-radius: 8px;',
        '  overflow: hidden;',
        '  will-change: left, top;',
        '}',
        '.dv-drag-target-preview {',
        '  opacity: 0.72;',
        '  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);',
        '  border-radius: 8px;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-slot-above-label {',
        '  flex-shrink: 0;',
        '  height: 18px;',
        '  margin-bottom: 4px;',
        '  box-sizing: border-box;',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 6px;',
        '  flex-wrap: wrap;',
        '  width: fit-content;',
        '  max-width: 100%;',
        '}',
        '#wf-dash-modal .dv-slot-above-label-sim {',
        '  font-size: 9px;',
        '  font-weight: 600;',
        '  color: var(--muted-foreground, #94a3b8);',
        '  letter-spacing: 0.02em;',
        '  line-height: 1.3;',
        '}',
        '#wf-dash-modal .dv-slot-above-label-nodiff {',
        '  font-size: 9px;',
        '  font-weight: 700;',
        '  color: var(--muted-foreground, #94a3b8);',
        '  border: 1px solid var(--border, #475569);',
        '  border-radius: 3px;',
        '  padding: 1px 5px;',
        '  letter-spacing: 0.04em;',
        '  line-height: 1.3;',
        '}',
        '#wf-dash-modal .dv-slots-area {',
        '  position: relative;',
        '  flex: 1;',
        '  min-height: 0;',
        '  overflow: hidden;',
        '  display: flex;',
        '  flex-direction: column;',
        '  padding: ' + DV_SLOTS_AREA_PAD + 'px;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-slots-stack {',
        '  flex: 1;',
        '  min-height: 0;',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 4px;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-slots-columns-row {',
        '  flex: 1;',
        '  min-height: 0;',
        '  display: flex;',
        '  gap: ' + DV_SLOT_GAP + 'px;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-slots-area--rolling {',
        '  gap: 0;',
        '}',
        '#wf-dash-modal .dv-slots-area--rolling .dv-slots-columns-row {',
        '  overflow-x: auto;',
        '  overflow-y: hidden;',
        '}',
        '#wf-dash-modal .dv-slots-area--rolling .dv-slot-column--base {',
        '  position: static;',
        '  z-index: auto;',
        '}',
        '#wf-dash-modal .dv-slots-area--rolling .dv-slot-columns-extra {',
        '  overflow: visible;',
        '  flex: 0 0 auto;',
        '  min-width: auto;',
        '}',
        '#wf-dash-modal .dv-slots-area--rolling .dv-slot-column--base .dv-slot-wrap {',
        '  border: 1px solid var(--border, #e2e8f0);',
        '}',
        '#wf-dash-modal .dv-rolling-overlay {',
        '  position: absolute;',
        '  pointer-events: none;',
        '  border: 2px solid var(--brand, #2563eb);',
        '  border-radius: 10px;',
        '  z-index: 3;',
        '  box-sizing: border-box;',
        '  transition: left 0.25s cubic-bezier(0.37, 0, 0.63, 1),',
        '              width 0.25s cubic-bezier(0.37, 0, 0.63, 1);',
        '}',
        '#wf-dash-modal .dv-slot-wrap.dv-slot-wrap--compare-hover {',
        '  border: 1px solid var(--brand, #2563eb) !important;',
        '}',
        '#wf-dash-modal .dv-slot-author {',
        '  margin-top: 3px;',
        '  font-size: 10px;',
        '  color: var(--muted-foreground, #64748b);',
        '  white-space: nowrap;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '}',
        '#wf-dash-modal .dv-slot-meta {',
        '  display: flex;',
        '  align-items: baseline;',
        '  justify-content: space-between;',
        '  gap: 8px;',
        '  margin-top: 2px;',
        '  min-width: 0;',
        '}',
        '#wf-dash-modal .dv-slot-meta .dv-slot-created {',
        '  margin-top: 0;',
        '  flex: 1;',
        '  min-width: 0;',
        '}',
        '#wf-dash-modal .dv-slot-version-count {',
        '  flex-shrink: 0;',
        '  font-size: 10px;',
        '  line-height: 1.3;',
        '  white-space: nowrap;',
        '}',
        '#wf-dash-modal .dv-version-count-num {',
        '  color: var(--foreground, #f8fafc);',
        '  font-weight: 600;',
        '}',
        '#wf-dash-modal .dv-version-count-label {',
        '  color: var(--muted-foreground, #64748b);',
        '  font-weight: 600;',
        '}',
        '#wf-dash-modal .dv-stash-chip {',
        '  display: flex;',
        '  align-items: flex-start;',
        '  gap: 8px;',
        '  padding: 8px 10px;',
        '  background: var(--card, #fff);',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 8px;',
        '  cursor: pointer;',
        '  transition: border-color 0.15s;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-stash-chip--active {',
        '  border-color: #22c55e;',
        '}',
        '#wf-dash-modal .dv-stash-chip-main {',
        '  flex: 1;',
        '  min-width: 0;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-stash-key {',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
        '  color: var(--foreground, #f8fafc);',
        '  white-space: nowrap;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '}',
        '#wf-dash-modal .dv-stash-chip--active .dv-stash-key {',
        '  color: #22c55e;',
        '}',
        '#wf-dash-modal .dv-slot-created {',
        '  margin-top: 2px;',
        '  font-size: 10px;',
        '  line-height: 1.3;',
        '  white-space: nowrap;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '}',
        '#wf-dash-modal .dv-version-submitted {',
        '  margin: 0;',
        '  padding: 0;',
        '  flex-shrink: 0;',
        '  font-size: 10px;',
        '  line-height: 1.3;',
        '}',
        '#wf-dash-modal .dv-timestamp-accent {',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#wf-dash-modal .dv-timestamp-date {',
        '  color: var(--foreground, #0f172a);',
        '}',
        '#wf-dash-modal .dv-slot-column {',
        '  width: ' + DV_SLOT_WIDTH_PX + 'px;',
        '  min-width: ' + DV_SLOT_WIDTH_PX + 'px;',
        '  flex-shrink: 0;',
        '  display: flex;',
        '  flex-direction: column;',
        '  min-height: 0;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-slot-column--base {',
        '  position: sticky;',
        '  left: 0;',
        '  z-index: 2;',
        '}',
        '#wf-dash-modal .dv-slot-columns-extra {',
        '  flex: 1;',
        '  display: flex;',
        '  gap: ' + DV_SLOT_GAP + 'px;',
        '  overflow-x: auto;',
        '  overflow-y: hidden;',
        '  min-width: 0;',
        '  min-height: 0;',
        '}',
        '#wf-dash-modal .dv-slot-wrap {',
        '  flex: 1;',
        '  display: flex;',
        '  flex-direction: column;',
        '  min-height: 0;',
        '  overflow: hidden;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 8px;',
        '  background: var(--card, #fff);',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-slot-column--base .dv-slot-wrap {',
        '  border: 2px solid var(--brand, var(--primary, #2563eb));',
        '}',
        '#wf-dash-modal #dv-right.dv-highlights-off .dv-slot-column--base .dv-slot-wrap {',
        '  border: 1px solid var(--border, #e2e8f0);',
        '}',
        '#wf-dash-modal #dv-right.dv-highlights-off .dv-slot-wrap.dv-slot-wrap--compare-hover {',
        '  border: 1px solid var(--border, #e2e8f0) !important;',
        '}',
        '#wf-dash-modal #dv-right.dv-highlights-off .dv-rolling-overlay {',
        '  display: none !important;',
        '}',
        '#wf-dash-modal .dv-slot-key-copy {',
        '  display: block;',
        '  width: 100%;',
        '  padding: 0;',
        '  border: none;',
        '  border-radius: 0;',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
        '  color: var(--foreground, #f8fafc);',
        '  background: transparent;',
        '  text-align: left;',
        '  overflow-wrap: anywhere;',
        '  word-break: break-all;',
        '  white-space: nowrap;',
        '  overflow: hidden;',
        '  text-overflow: ellipsis;',
        '  cursor: pointer;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-slot-key-copy--empty {',
        '  display: inline-block;',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  color: var(--foreground, #f8fafc);',
        '}',
        '#wf-dash-modal .dv-slot-key-copy:hover {',
        '  color: var(--brand, #2563eb);',
        '}',
        '#wf-dash-modal .dv-reel {',
        '  display: grid;',
        '  grid-template-columns: 1fr 26px;',
        '  grid-template-rows: 1fr;',
        '  column-gap: 4px;',
        '  flex: 1;',
        '  height: 100%;',
        '  min-height: 0;',
        '  padding: 6px 4px 6px 6px;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-reel-viewport {',
        '  grid-column: 1;',
        '  grid-row: 1;',
        '  align-self: start;',
        '  height: ' + DV_REEL_VIEWPORT_H_EXPR + ';',
        '  min-height: 0;',
        '  overflow: hidden;',
        '  position: relative;',
        '}',
        '#wf-dash-modal .dv-reel-track {',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: ' + DV_REEL_ROW_GAP + 'px;',
        '  will-change: transform;',
        '}',
        '#wf-dash-modal .dv-reel-card {',
        '  flex-shrink: 0;',
        '  height: var(--dv-reel-lens-h, ' + DV_REEL_LENS_H + 'px);',
        '  min-height: 0;',
        '  overflow: hidden;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-reel-card-body {',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 4px;',
        '  height: 100%;',
        '  min-height: 0;',
        '}',
        '#wf-dash-modal .dv-reel-card-prompt {',
        '  flex: 1;',
        '  min-height: 0;',
        '  overflow: hidden;',
        '  padding: 8px 10px;',
        '  background: var(--background, #fff);',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  box-sizing: border-box;',
        '  display: flex;',
        '  flex-direction: column;',
        '}',
        '#wf-dash-modal .dv-reel-card-content {',
        '  flex: 1;',
        '  min-height: 0;',
        '  overflow-y: auto;',
        '  overflow-x: hidden;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-diff-equal {',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#wf-dash-modal .dv-reel-card pre {',
        '  margin: 0;',
        '  padding: 0;',
        '  white-space: pre-wrap;',
        '  font-family: monospace;',
        '  font-size: 11px;',
        '  line-height: 1.5;',
        '  word-break: break-word;',
        '}',
        '#wf-dash-modal .dv-reel-empty-mark {',
        '  font-size: 11px;',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#wf-dash-modal .dv-reel-arrows {',
        '  grid-column: 2;',
        '  grid-row: 1;',
        '  align-self: start;',
        '  position: relative;',
        '  display: flex;',
        '  flex-direction: column;',
        '  align-items: center;',
        '  height: ' + DV_REEL_VIEWPORT_H_EXPR + ';',
        '  min-height: 0;',
        '  width: 100%;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-reel-arrows-nav {',
        '  flex: 1;',
        '  position: relative;',
        '  display: flex;',
        '  flex-direction: column;',
        '  min-height: 0;',
        '  width: 100%;',
        '  overflow: hidden;',
        '  padding-top: ' + DV_REEL_COPY_RAIL_PAD + 'px;',
        '  box-sizing: border-box;',
        '}',
        '#wf-dash-modal .dv-reel-arrows-nav-viewport {',
        '  flex: 1;',
        '  position: relative;',
        '  min-height: 0;',
        '  width: 100%;',
        '  overflow: hidden;',
        '}',
        '#wf-dash-modal .dv-reel-arrows-nav-track {',
        '  display: flex;',
        '  flex-direction: column;',
        '  align-items: center;',
        '  width: 100%;',
        '  will-change: transform;',
        '}',
        '#wf-dash-modal .dv-reel-arrows-nav-controls {',
        '  position: absolute;',
        '  inset: 0;',
        '  z-index: 2;',
        '  display: flex;',
        '  flex-direction: column;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: ' + DV_REEL_NAV_ROW_GAP + 'px;',
        '  pointer-events: none;',
        '}',
        '#wf-dash-modal .dv-reel-arrows-nav-controls .dv-reel-arrow {',
        '  pointer-events: auto;',
        '}',
        '#wf-dash-modal .dv-reel-nav-current-slot {',
        '  height: var(--dv-reel-nav-row-h, ' + DV_REEL_NAV_ROW_H + 'px);',
        '  width: 100%;',
        '  flex-shrink: 0;',
        '  pointer-events: none;',
        '}',
        '#wf-dash-modal .dv-reel-version-label {',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  height: ' + DV_REEL_NAV_ROW_H + 'px;',
        '  width: 100%;',
        '  flex-shrink: 0;',
        '  box-sizing: border-box;',
        '  font-size: 8px;',
        '  font-weight: 600;',
        '  color: var(--muted-foreground, #64748b);',
        '  line-height: 1;',
        '  font-family: inherit;',
        '  user-select: none;',
        '}',
        '#wf-dash-modal .dv-reel-version-label--current {',
        '  font-size: 9px;',
        '  font-weight: 700;',
        '  color: var(--foreground, #f8fafc);',
        '}',
        '#wf-dash-modal .dv-reel-copy {',
        '  position: absolute;',
        '  top: ' + DV_REEL_COPY_TOP + 'px;',
        '  left: 0;',
        '  z-index: 3;',
        '  flex-shrink: 0;',
        '  margin: 0;',
        '}',
    ].join('\n');
}

function _dvFlashTabAdded() {
    const loader = Context.dashboard && Context.dashboard._loader;
    const modal = loader && loader._modal;
    if (!modal) return;
    const tab = modal.querySelector('[data-wf-dash-tab="diff-viewer"]');
    if (!tab) return;
    tab.classList.remove('wf-dash-tab--add-pulse');
    void tab.offsetWidth;
    tab.classList.add('wf-dash-tab--add-pulse');
    tab.addEventListener('animationend', () => tab.classList.remove('wf-dash-tab--add-pulse'), { once: true });
    Logger.debug('diff-viewer: tab add pulse');
}

// ── Public API: Context.diffViewer ──

function _dvApiAddTask(seed) {
    // seed: { taskId, key, authorName, authorEmail } — always re-hydrated from PostgREST
    const modal = Context.dashboard && Context.dashboard._loader && Context.dashboard._loader._modal;
    _dvAddSlot(seed, modal);
}

function _dvApiIsStashed(taskId) {
    return _dvStashFind(taskId) >= 0;
}

// ── Plugin ──

const plugin = {
    id: 'diff-viewer',
    name: 'Diff Viewer',
    description: 'Slot-machine task/version diff tab for the Ops dashboard',
    _version: '2.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('diff-viewer: dashboard loader not registered');
            return;
        }

        // Reset any orphaned drag UI from a prior session
        const orphanGhost = document.getElementById('dv-drag-ghost');
        if (orphanGhost) orphanGhost.remove();
        document.querySelectorAll('.dv-drag-target-preview').forEach((el) => el.remove());
        _dvState.drag = _dvCreateEmptyDragState();

        // Load persisted stash
        _dvState.stash = _dvLoadStash();

        // Restore persisted granularity
        try {
            const stored = Storage.getData(DV_GRANULARITY_KEY, null);
            if (stored === 'char' || stored === 'word') _dvState.granularity = stored;
        } catch (_e) { /* no-op */ }

        // Restore persisted comparison mode
        try {
            const storedComp = Storage.getData(DV_COMP_MODE_KEY, null);
            if (storedComp === 'base' || storedComp === 'rolling') _dvState.compMode = storedComp;
        } catch (_e) { /* no-op */ }

        // Restore persisted highlight modality
        try {
            const storedModality = Storage.getData(DV_HIGHLIGHT_MODALITY_KEY, null);
            if (storedModality === 'differences' || storedModality === 'similarities') {
                _dvState.highlightModality = storedModality;
            }
        } catch (_e) { /* no-op */ }

        // Inject styles
        _dvInjectStyles();

        // Expose public API
        Context.diffViewer = {
            addTask: _dvApiAddTask,
            isStashed: _dvApiIsStashed
        };

        // Register tab
        Context.dashboard.registerTab({
            id: 'diff-viewer',
            label: 'Diff Viewer',
            panelHtml(dash) { return _dvPanelHtml(dash); },
            attachListeners(modal, dash) { _dvAttachListeners(modal, dash); },
            onBuilt(modal) {
                _dvRenderStash(modal);
                _dvAttachReelLensResizeObserver(modal);
                _dvAttachRollingOverlayListeners(modal);
                _dvSyncHighlightsUi(modal);
                _dvSyncHighlightModalityUi(modal);
                _dvSyncCompModeUi(modal);
                _dvSyncHighlightLengthUi(modal);
                // Restore session slots (if any were captured)
                if (_dvState.slots.length > 0) _dvRenderAll(modal);
            },
            onActivate(modal) {
                _dvRenderAll(modal);
                _dvSyncHighlightsUi(modal);
                _dvSyncHighlightModalityUi(modal);
                _dvSyncCompModeUi(modal);
                _dvScheduleReelLensSync(modal);
                requestAnimationFrame(() => {
                    const loader = Context.dashboard._loader;
                    if (loader && typeof loader._applyAllSidePanelWidths === 'function') {
                        loader._applyAllSidePanelWidths();
                    }
                });
            },
            captureState(modal) {
                // In-session capture: slots survive dashboard close/reopen within the same page
                // (no-op needed since _dvState is module-level and persists in memory)
            }
        });

        Logger.log('diff-viewer: tab registered (stash: ' + _dvState.stash.length + ' items)');
    }
};
