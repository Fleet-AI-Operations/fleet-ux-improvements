// ============= diff-viewer.js =============
// Diff Viewer tab for the Ops dashboard.
// Provides a slot-machine side-by-side task/version diff, a free-text diff sub-mode,
// and an "Add to Diff" action that hooks into Search Output cards.

// ── Constants ──

const DV_STASH_KEY = 'fleet-ux:diff-viewer-stash';
const DV_GRANULARITY_KEY = 'fleet-ux:diff-viewer-granularity';
const DV_MAX_SLOTS = 6;
const DV_SLOT_WIDTH_PX = 300;
const DV_CHAR_DIFF_LIMIT = 15000;
const DV_REEL_HALF_H = 14;
const DV_REEL_PEER_H = 72;
const DV_REEL_LENS_H = 220;
const DV_REEL_ROW_GAP = 10;

let _dvSlotSeq = 0;

// ── Module state ──

const _dvState = {
    mode: 'tasks',       // 'tasks' | 'free-text'
    granularity: 'word', // 'word' | 'char'
    slots: [],           // Array<DvSlot>
    stash: [],           // Array<DvStashEntry> — persisted
    freeBase: '',
    freeCompare: '',
    dragFromIdx: null,
    searchLoading: false,
    searchError: null
};

// DvSlot:   { slotId, taskId, key, authorName, authorEmail, promptVersions, lensIndex, loading, error }
// DvStash:  { taskId, key, authorName, authorEmail }

// ── LCS diff engine (ported from prompt-diff-highlight.js) ──

function _dvTokenize(text) {
    const tokens = [];
    let current = '';
    for (const char of text) {
        if (char === '\n') {
            if (current) tokens.push(current);
            tokens.push('\n');
            current = '';
        } else if (char === ' ' || char === '\t') {
            current += char;
        } else {
            if (current && (current.endsWith(' ') || current.endsWith('\t'))) {
                tokens.push(current);
                current = '';
            }
            current += char;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

function _dvComputeLCS(a, b) {
    const m = a.length, n = b.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp;
}

function _dvBacktrack(dp, a, b) {
    const diff = [];
    let i = a.length, j = b.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            diff.unshift({ type: 'equal', value: a[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.unshift({ type: 'add', value: b[j - 1] });
            j--;
        } else {
            diff.unshift({ type: 'remove', value: a[i - 1] });
            i--;
        }
    }
    return diff;
}

function _dvComputeWordDiff(oldText, newText) {
    const a = _dvTokenize(oldText), b = _dvTokenize(newText);
    return _dvBacktrack(_dvComputeLCS(a, b), a, b);
}

function _dvComputeCharDiff(oldText, newText) {
    const a = oldText.split(''), b = newText.split('');
    return _dvBacktrack(_dvComputeLCS(a, b), a, b);
}

function _dvGroupConsecutive(diff, includeTypes, highlightType) {
    const filtered = diff.filter((d) => includeTypes.includes(d.type));
    const groups = [];
    for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i];
        const nextItem = filtered[i + 1];
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.type === item.type && item.value !== '\n' && !lastGroup.values.includes('\n')) {
            lastGroup.values.push(item.value);
            if (nextItem && nextItem.type !== item.type && item.type === highlightType) lastGroup.trimTrailing = true;
        } else {
            const group = { type: item.type, values: [item.value], trimTrailing: false };
            if (nextItem && nextItem.type !== item.type && item.type === highlightType) group.trimTrailing = true;
            groups.push(group);
        }
    }
    return groups;
}

function _dvEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _dvTrimTrailing(str) { return str.replace(/[ \t]+$/, ''); }

function _dvHighlightStyles() {
    const dark = document.documentElement.classList.contains('dark');
    const removeBg = dark ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.3)';
    const addBg = dark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.3)';
    const span = 'border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;';
    return {
        remove: `background-color:${removeBg};${span}`,
        add: `background-color:${addBg};${span}`
    };
}

function _dvRenderBaseHtml(diff, removeStyle) {
    const groups = _dvGroupConsecutive(diff, ['equal', 'remove'], 'remove');
    let html = '';
    groups.forEach((group) => {
        let text = group.values.join('');
        if (group.type === 'remove') {
            if (text === '\n') {
                html += `<span style="${removeStyle}">↵</span>\n`;
            } else {
                const trimmed = group.trimTrailing ? _dvTrimTrailing(text) : text;
                const trail = group.trimTrailing ? text.slice(trimmed.length) : '';
                html += `<span style="${removeStyle}">${_dvEscHtml(trimmed)}</span>${_dvEscHtml(trail)}`;
            }
        } else {
            html += _dvEscHtml(text);
        }
    });
    return html;
}

function _dvRenderCompareHtml(diff, addStyle) {
    const groups = _dvGroupConsecutive(diff, ['equal', 'add'], 'add');
    let html = '';
    groups.forEach((group) => {
        let text = group.values.join('');
        if (group.type === 'add') {
            if (text === '\n') {
                html += `<span style="${addStyle}">↵</span>\n`;
            } else {
                const trimmed = group.trimTrailing ? _dvTrimTrailing(text) : text;
                const trail = group.trimTrailing ? text.slice(trimmed.length) : '';
                html += `<span style="${addStyle}">${_dvEscHtml(trimmed)}</span>${_dvEscHtml(trail)}`;
            }
        } else {
            html += _dvEscHtml(text);
        }
    });
    return html;
}

function _dvDiffPair(baseText, compareText, granularity) {
    const isChar = granularity === 'char';
    if (isChar && (baseText.length + compareText.length > DV_CHAR_DIFF_LIMIT)) {
        Logger.warn('diff-viewer: texts too large for char diff (' + (baseText.length + compareText.length) + ' chars), falling back to word diff');
        const diff = _dvComputeWordDiff(baseText, compareText);
        const styles = _dvHighlightStyles();
        return { baseHtml: _dvRenderBaseHtml(diff, styles.remove), compareHtml: _dvRenderCompareHtml(diff, styles.add) };
    }
    const diff = isChar ? _dvComputeCharDiff(baseText, compareText) : _dvComputeWordDiff(baseText, compareText);
    const styles = _dvHighlightStyles();
    return { baseHtml: _dvRenderBaseHtml(diff, styles.remove), compareHtml: _dvRenderCompareHtml(diff, styles.add) };
}

// ── Stash persistence ──

function _dvLoadStash() {
    try {
        const raw = localStorage.getItem(DV_STASH_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_e) { return []; }
}

function _dvSaveStash() {
    try { localStorage.setItem(DV_STASH_KEY, JSON.stringify(_dvState.stash)); } catch (_e) { /* no-op */ }
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
    return {
        taskId: task.id,
        key: task.key || '',
        authorName: (task.author && task.author.name) || '',
        authorEmail: (task.author && task.author.email) || '',
        promptVersions: taskData.promptVersions || []
    };
}

// ── Stash management ──

function _dvStashFind(taskId) {
    return _dvState.stash.findIndex((s) => s.taskId === taskId);
}

function _dvAddToStash(entry) {
    if (_dvStashFind(entry.taskId) < 0) {
        _dvState.stash.push({ taskId: entry.taskId, key: entry.key, authorName: entry.authorName, authorEmail: entry.authorEmail });
        _dvSaveStash();
        Logger.log('diff-viewer: stash add — ' + (entry.key || entry.taskId));
    }
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
            authorEmail: seed.authorEmail
        });
    }
    _dvRenderAll(modal);
    void _dvHydrateSlot(slotId, seed, modal);
}

async function _dvHydrateSlot(slotId, seed, modal) {
    try {
        const lookup = seed.raw || seed.key || seed.taskId;
        if (!lookup) throw new Error('No task identifier to hydrate');
        const data = await _dvFetchTask(lookup);
        const slotIdx = _dvState.slots.findIndex((s) => s.slotId === slotId);
        if (slotIdx < 0) return; // slot was removed before hydration completed
        const slot = _dvState.slots[slotIdx];
        slot.taskId = data.taskId;
        slot.promptVersions = data.promptVersions;
        slot.authorName = data.authorName || slot.authorName;
        slot.authorEmail = data.authorEmail || slot.authorEmail;
        slot.key = data.key || slot.key;
        slot.lensIndex = _dvNextLensIndex(data.taskId, data.promptVersions) ?? 0;
        slot.loading = false;
        _dvAddToStash({
            taskId: data.taskId,
            key: data.key,
            authorName: data.authorName,
            authorEmail: data.authorEmail
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
    Logger.log('diff-viewer: slot removed — ' + (removed.key || removed.taskId));
    _dvRenderAll(modal);
}

function _dvMinimizeSlot(slotIdx, modal) {
    if (slotIdx < 0 || slotIdx >= _dvState.slots.length) return;
    const slot = _dvState.slots[slotIdx];
    _dvAddToStash({ taskId: slot.taskId, key: slot.key, authorName: slot.authorName, authorEmail: slot.authorEmail });
    _dvState.slots.splice(slotIdx, 1);
    Logger.log('diff-viewer: slot minimized to stash — ' + (slot.key || slot.taskId));
    _dvRenderAll(modal);
}

function _dvShiftLens(slotIdx, delta, modal) {
    const slot = _dvState.slots[slotIdx];
    if (!slot || !slot.promptVersions) return;
    const newIdx = slot.lensIndex + delta;
    if (newIdx < 0 || newIdx >= slot.promptVersions.length) return;
    slot.lensIndex = newIdx;
    Logger.debug('diff-viewer: lens shift slot=' + slotIdx + ' delta=' + delta + ' → v' + (slot.promptVersions[newIdx].displayVersionNo));
    _dvRenderAll(modal);
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
            promptVersions: base.promptVersions,
            lensIndex: i, loading: false, error: null
        });
    }
    Logger.log('diff-viewer: View Complete Task Progression — ' + _dvState.slots.length + ' slots');
    _dvRenderAll(modal);
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

function _dvPanelHtml(dash) {
    const box = dash.panelBoxStyle ? dash.panelBoxStyle() : '';
    const label = dash.labelStyle ? dash.labelStyle() : 'font-size:11px;font-weight:600;color:var(--muted-foreground,#64748b);text-transform:uppercase;letter-spacing:.04em;';
    const input = dash.inputStyle ? dash.inputStyle() : 'border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:6px 9px;font-size:13px;width:100%;box-sizing:border-box;background:var(--background,#fff);color:var(--foreground,#0f172a);';
    const navBtn = dash.navBtnStyle ? dash.navBtnStyle() : 'padding:5px 10px;font-size:12px;font-weight:500;border:1px solid var(--border,#e2e8f0);border-radius:6px;cursor:pointer;background:var(--card,#fff);color:var(--foreground,#0f172a);white-space:nowrap;';
    const navBtnPrimary = dash.navBtnPrimaryStyle ? dash.navBtnPrimaryStyle() : navBtn + 'background:var(--brand,#2563eb);color:#fff;border-color:transparent;';

    const segBtnBase = 'padding:5px 12px;font-size:12px;font-weight:500;border:none;cursor:pointer;transition:background-color 0.15s,color 0.15s;line-height:1.4;';
    const seg = (id, label, active) => `<button type="button" data-dv-seg="${id}" style="${segBtnBase}background:${active ? 'var(--primary,#4f46e5)' : 'transparent'};color:${active ? '#fff' : 'var(--muted-foreground,#888)'}">${label}</button>`;

    const gran = _dvState.granularity;

    const leftHtml = `
    <div style="${box}display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;gap:12px;">
        <div style="flex-shrink:0;">
            <div style="${label}margin-bottom:6px;">Mode</div>
            <div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid var(--border,#e2e8f0);background:var(--muted,rgba(0,0,0,0.04));">
                <button type="button" data-dv-mode="tasks" style="${segBtnBase}background:${_dvState.mode==='tasks'?'var(--primary,#4f46e5)':'transparent'};color:${_dvState.mode==='tasks'?'#fff':'var(--muted-foreground,#888)'};border-right:1px solid var(--border,#e2e8f0);">Tasks</button>
                <button type="button" data-dv-mode="free-text" style="${segBtnBase}background:${_dvState.mode==='free-text'?'var(--primary,#4f46e5)':'transparent'};color:${_dvState.mode==='free-text'?'#fff':'var(--muted-foreground,#888)'};">Free Text</button>
            </div>
        </div>
        <div id="dv-tasks-controls" style="display:${_dvState.mode==='tasks'?'flex':'none'};flex-direction:column;gap:12px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;">
            <div style="flex-shrink:0;">
                <div style="${label}margin-bottom:6px;">Diff Granularity</div>
                <div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid var(--border,#e2e8f0);background:var(--muted,rgba(0,0,0,0.04));">
                    ${seg('word', 'Word', gran==='word')}
                    <button type="button" data-dv-seg="char" style="${segBtnBase}background:${gran==='char'?'var(--primary,#4f46e5)':'transparent'};color:${gran==='char'?'#fff':'var(--muted-foreground,#888)'};">Character</button>
                </div>
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;">
                <div style="${label}">Actions</div>
                <button type="button" data-dv-action="progression" style="${navBtn}width:100%;text-align:left;font-size:11px;" title="Set each slot to a successive version of the base task">View Complete Task Progression</button>
                <div style="display:flex;gap:6px;">
                    <button type="button" data-dv-action="all-v1" style="${navBtn}flex:1;font-size:11px;">All v1s</button>
                    <button type="button" data-dv-action="all-final" style="${navBtn}flex:1;font-size:11px;">All final versions</button>
                </div>
            </div>
            <div style="flex-shrink:0;">
                <div style="${label}margin-bottom:6px;">Add task</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <input id="dv-search-input" type="text" placeholder="Task ID, key, URL, version ID…" style="${input}flex:1;"/>
                    <button id="dv-search-btn" type="button" style="${navBtnPrimary}flex-shrink:0;">Add</button>
                </div>
                <div id="dv-search-error" style="display:none;font-size:11px;color:#dc2626;margin-top:4px;"></div>
            </div>
            <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;">
                <div style="${label}margin-bottom:6px;flex-shrink:0;">Stash</div>
                <div id="dv-stash-chips" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;">
                    <div style="font-size:11px;color:var(--muted-foreground,#64748b);padding:4px 0;">No tasks in stash.</div>
                </div>
            </div>
        </div>
        <div id="dv-free-controls" style="display:${_dvState.mode==='free-text'?'flex':'none'};flex-direction:column;gap:12px;flex-shrink:0;">
            <div>
                <div style="${label}margin-bottom:6px;">Diff Granularity</div>
                <div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid var(--border,#e2e8f0);background:var(--muted,rgba(0,0,0,0.04));">
                    ${seg('word', 'Word', gran==='word')}
                    <button type="button" data-dv-seg="char" style="${segBtnBase}background:${gran==='char'?'var(--primary,#4f46e5)':'transparent'};color:${gran==='char'?'#fff':'var(--muted-foreground,#888)'};">Character</button>
                </div>
            </div>
        </div>
    </div>`;

    const rightHtml = `
    <div id="dv-right" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">
        <div id="dv-slots-area" style="display:${_dvState.mode==='tasks'?'flex':'none'};flex:1;overflow:hidden;min-height:0;">
            <div id="dv-base-container" style="width:${DV_SLOT_WIDTH_PX}px;min-width:${DV_SLOT_WIDTH_PX}px;flex-shrink:0;border-right:2px solid var(--brand,var(--primary,#2563eb));display:flex;flex-direction:column;overflow:hidden;">
                <div id="dv-base-slot-inner" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
            </div>
            <div id="dv-extra-container" style="flex:1;display:flex;overflow-x:auto;overflow-y:hidden;min-width:0;"></div>
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

    return dash.splitPanelSectionHtml
        ? dash.splitPanelSectionHtml(leftHtml, rightHtml, 'diff-viewer')
        : `<div style="display:flex;flex:1;min-height:0;overflow:hidden;">${leftHtml}${rightHtml}</div>`;
}

// ── Slot card HTML ──

function _dvSlotHtml(slot, slotIdx, slotCount) {
    const isBase = slotIdx === 0;
    const headerBg = isBase
        ? 'color-mix(in srgb,var(--brand,#2563eb) 8%,var(--card,#fff))'
        : 'var(--card,#fff)';
    const authorDisplay = slot.authorName
        ? _dvEscHtml(slot.authorName) + (slot.authorEmail ? ' · ' + _dvEscHtml(slot.authorEmail) : '')
        : _dvEscHtml(slot.authorEmail || '—');
    const keyDisplay = _dvEscHtml(slot.key || (slot.taskId ? slot.taskId.slice(0, 8) + '…' : '—'));

    const baseBandHtml = isBase
        ? '<div class="dv-slot-base-band"><span class="dv-slot-base-badge">BASE</span></div>'
        : '<div class="dv-slot-base-band dv-slot-base-band--spacer" aria-hidden="true"></div>';

    const btnStyle = 'width:22px;height:22px;padding:0;border:none;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
    const minimizeBtn = `<button type="button" data-dv-minimize="${slotIdx}" title="Minimize to stash" style="${btnStyle}background:var(--muted,rgba(0,0,0,0.08));color:var(--muted-foreground,#64748b);">−</button>`;
    const removeBtn = `<button type="button" data-dv-remove="${slotIdx}" title="Remove slot" style="${btnStyle}background:#fee2e2;color:#dc2626;">×</button>`;

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
        ${baseBandHtml}
        <div class="dv-slot-header" data-dv-drag="${slotIdx}" style="padding:8px 10px;background:${headerBg};border-bottom:1px solid var(--border,#e2e8f0);cursor:grab;flex-shrink:0;display:flex;align-items:flex-start;gap:8px;user-select:none;">
            <div style="flex:1;min-width:0;overflow:hidden;">
                <div style="font-size:11px;font-weight:600;color:var(--foreground,#0f172a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_dvEscHtml(slot.authorName || '') + (slot.authorEmail ? ' · ' + _dvEscHtml(slot.authorEmail) : '')}">${authorDisplay}</div>
                <div style="font-size:10px;color:var(--muted-foreground,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_dvEscHtml(slot.key || slot.taskId)}">${keyDisplay}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">${minimizeBtn}${removeBtn}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;">${bodyHtml}</div>
    </div>`;
}

function _dvReelHtml(slot, slotIdx) {
    const versions = slot.promptVersions;
    const lensIdx = slot.lensIndex;
    const prevV = lensIdx > 0 ? versions[lensIdx - 1] : null;
    const lensV = versions[lensIdx];
    const nextV = lensIdx < versions.length - 1 ? versions[lensIdx + 1] : null;
    const hasMoreAbove = lensIdx > 1;
    const hasMoreBelow = lensIdx < versions.length - 2;
    const canUp = lensIdx > 0;
    const canDown = lensIdx < versions.length - 1;

    const halfBar = (visible) =>
        `<div class="dv-reel-half${visible ? '' : ' dv-reel-half--hidden'}" aria-hidden="${visible ? 'false' : 'true'}">···</div>`;

    const versionBox = (v, role) => {
        const isLens = role === 'lens';
        const label = v ? 'v' + v.displayVersionNo : '';
        const cls = isLens ? 'dv-reel-lens' : ('dv-reel-peer' + (v ? '' : ' dv-reel-peer--empty'));
        if (!v) {
            return `<div class="${cls}"><span class="dv-reel-empty-mark">—</span></div>`;
        }
        const dataAttr = isLens ? ` data-dv-lens-pre="${slotIdx}"` : '';
        return `<div class="${cls}">
            <span class="dv-reel-version-label">${label}</span>
            <pre${dataAttr}>${_dvEscHtml(v.prompt || '')}</pre>
        </div>`;
    };

    const arrowBtn = (dir, enabled) =>
        `<button type="button" data-dv-lens-${dir}="${slotIdx}" ${enabled ? '' : 'disabled'} title="${dir === 'up' ? 'Previous' : 'Next'} version" class="dv-reel-arrow"${enabled ? '' : ' disabled'}>${dir === 'up' ? '↑' : '↓'}</button>`;

    return `<div class="dv-reel">
        ${halfBar(hasMoreAbove)}
        ${versionBox(prevV, 'peer')}
        ${versionBox(lensV, 'lens')}
        ${versionBox(nextV, 'peer')}
        ${halfBar(hasMoreBelow)}
        <div class="dv-reel-arrows">
            ${arrowBtn('up', canUp)}
            ${arrowBtn('down', canDown)}
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
}

function _dvRenderSlotsArea(modal) {
    const baseInner = _dvQ(modal, 'dv-base-slot-inner');
    const extraContainer = _dvQ(modal, 'dv-extra-container');
    if (!baseInner || !extraContainer) return;

    if (_dvState.slots.length === 0) {
        baseInner.innerHTML = _dvEmptySlotPlaceholder();
        extraContainer.innerHTML = '';
        return;
    }
    baseInner.innerHTML = _dvSlotHtml(_dvState.slots[0], 0, _dvState.slots.length);
    let extraHtml = '';
    for (let i = 1; i < _dvState.slots.length; i++) {
        extraHtml += `<div style="width:${DV_SLOT_WIDTH_PX}px;min-width:${DV_SLOT_WIDTH_PX}px;flex-shrink:0;border-right:1px solid var(--border,#e2e8f0);display:flex;flex-direction:column;height:100%;overflow:hidden;">${_dvSlotHtml(_dvState.slots[i], i, _dvState.slots.length)}</div>`;
    }
    extraContainer.innerHTML = extraHtml;
}

function _dvRenderStash(modal) {
    const chips = _dvQ(modal, 'dv-stash-chips');
    if (!chips) return;
    if (_dvState.stash.length === 0) {
        chips.innerHTML = `<div style="font-size:11px;color:var(--muted-foreground,#64748b);padding:4px 0;">No tasks in stash.</div>`;
        return;
    }
    // Count how many slots exist per task
    const slotCountByTaskId = new Map();
    for (const s of _dvState.slots) {
        slotCountByTaskId.set(s.taskId, (slotCountByTaskId.get(s.taskId) || 0) + 1);
    }
    let html = '';
    _dvState.stash.forEach((entry, idx) => {
        const active = slotCountByTaskId.has(entry.taskId);
        const authorLine = entry.authorName
            ? _dvEscHtml(entry.authorName) + (entry.authorEmail ? ' · ' + _dvEscHtml(entry.authorEmail) : '')
            : _dvEscHtml(entry.authorEmail || '—');
        const keyLine = _dvEscHtml(entry.key || entry.taskId.slice(0, 12) + '…');
        const chipBg = active ? 'var(--green-50,#f0fdf4)' : 'var(--card,#fff)';
        const chipBorder = active ? '#22c55e' : 'var(--border,#e2e8f0)';
        const chipColor = active ? '#15803d' : 'var(--foreground,#0f172a)';
        html += `<div data-dv-stash-chip="${idx}" style="display:flex;align-items:flex-start;gap:6px;padding:7px 8px;background:${chipBg};border:1px solid ${chipBorder};border-radius:7px;cursor:pointer;transition:border-color 0.15s,background 0.15s;" title="Click to add slot">
            <div style="flex:1;min-width:0;overflow:hidden;">
                <div style="font-size:11px;font-weight:600;color:${chipColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${authorLine}</div>
                <div style="font-size:10px;color:var(--muted-foreground,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${keyLine}</div>
            </div>
            <button type="button" data-dv-stash-remove="${idx}" title="Remove from stash" style="width:18px;height:18px;padding:0;border:none;border-radius:3px;background:transparent;color:var(--muted-foreground,#64748b);cursor:pointer;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
        </div>`;
    });
    chips.innerHTML = html;
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
        chip.style.background = active ? 'var(--green-50,#f0fdf4)' : 'var(--card,#fff)';
        chip.style.borderColor = active ? '#22c55e' : 'var(--border,#e2e8f0)';
        const authorEl = chip.querySelector('div > div:first-child');
        if (authorEl) authorEl.style.color = active ? '#15803d' : 'var(--foreground,#0f172a)';
    });
}

// ── Diff rendering ──

function _dvRenderDiffs(modal) {
    if (_dvState.mode !== 'tasks') return;
    if (_dvState.slots.length < 2) {
        // Clear any existing diff highlights on base
        const basePre = modal.querySelector('[data-dv-lens-pre="0"]');
        if (basePre) basePre.innerHTML = _dvEscHtml(
            (_dvState.slots[0] && _dvState.slots[0].promptVersions && _dvState.slots[0].promptVersions[_dvState.slots[0].lensIndex] && _dvState.slots[0].promptVersions[_dvState.slots[0].lensIndex].prompt) || ''
        );
        return;
    }
    const base = _dvState.slots[0];
    if (!base || !base.promptVersions) return;
    const baseText = (base.promptVersions[base.lensIndex] && base.promptVersions[base.lensIndex].prompt) || '';
    const twoSlots = _dvState.slots.length === 2;

    // Render base slot
    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (twoSlots) {
        const compare = _dvState.slots[1];
        if (compare && compare.promptVersions && !compare.loading) {
            const compareText = (compare.promptVersions[compare.lensIndex] && compare.promptVersions[compare.lensIndex].prompt) || '';
            const { baseHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
            if (baseLensPre) baseLensPre.innerHTML = baseHtml;
        } else if (baseLensPre) {
            baseLensPre.innerHTML = _dvEscHtml(baseText);
        }
    } else {
        if (baseLensPre) baseLensPre.innerHTML = _dvEscHtml(baseText);
    }

    // Render compare slots (green additions)
    for (let i = 1; i < _dvState.slots.length; i++) {
        const slot = _dvState.slots[i];
        if (!slot.promptVersions || slot.loading) continue;
        const compareText = (slot.promptVersions[slot.lensIndex] && slot.promptVersions[slot.lensIndex].prompt) || '';
        const { compareHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
        const lensPre = modal.querySelector('[data-dv-lens-pre="' + i + '"]');
        if (lensPre) lensPre.innerHTML = compareHtml;
    }
}

function _dvApplyHoverDiff(slotIdx, modal) {
    if (_dvState.slots.length <= 2 || slotIdx === 0) return;
    const base = _dvState.slots[0];
    const compare = _dvState.slots[slotIdx];
    if (!base || !base.promptVersions || !compare || !compare.promptVersions) return;
    const baseText = (base.promptVersions[base.lensIndex] && base.promptVersions[base.lensIndex].prompt) || '';
    const compareText = (compare.promptVersions[compare.lensIndex] && compare.promptVersions[compare.lensIndex].prompt) || '';
    const { baseHtml } = _dvDiffPair(baseText, compareText, _dvState.granularity);
    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (baseLensPre) baseLensPre.innerHTML = baseHtml;
}

function _dvClearHoverDiff(modal) {
    if (_dvState.slots.length <= 2) return;
    const base = _dvState.slots[0];
    if (!base || !base.promptVersions) return;
    const baseText = (base.promptVersions[base.lensIndex] && base.promptVersions[base.lensIndex].prompt) || '';
    const baseLensPre = modal.querySelector('[data-dv-lens-pre="0"]');
    if (baseLensPre) baseLensPre.innerHTML = _dvEscHtml(baseText);
}

function _dvRenderFreeTextDiff(modal) {
    const baseInput = _dvQ(modal, 'dv-free-base-input');
    const compareInput = _dvQ(modal, 'dv-free-compare-input');
    const baseDiff = _dvQ(modal, 'dv-free-base-diff');
    const compareDiff = _dvQ(modal, 'dv-free-compare-diff');
    if (!baseInput || !compareInput || !baseDiff || !compareDiff) return;
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
    const free = _dvQ(modal, 'dv-free-controls');
    const slotsArea = _dvQ(modal, 'dv-slots-area');
    const freeArea = _dvQ(modal, 'dv-free-area');
    const isTask = _dvState.mode === 'tasks';
    if (tasks) tasks.style.display = isTask ? 'flex' : 'none';
    if (free) free.style.display = isTask ? 'none' : 'flex';
    if (slotsArea) slotsArea.style.display = isTask ? 'flex' : 'none';
    if (freeArea) freeArea.style.display = isTask ? 'none' : 'flex';
    modal.querySelectorAll('[data-dv-mode]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-mode') === _dvState.mode;
        btn.style.background = active ? 'var(--primary,#4f46e5)' : 'transparent';
        btn.style.color = active ? '#fff' : 'var(--muted-foreground,#888)';
    });
}

function _dvSyncGranularityUi(modal) {
    modal.querySelectorAll('[data-dv-seg]').forEach((btn) => {
        const active = btn.getAttribute('data-dv-seg') === _dvState.granularity;
        btn.style.background = active ? 'var(--primary,#4f46e5)' : 'transparent';
        btn.style.color = active ? '#fff' : 'var(--muted-foreground,#888)';
    });
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
        const modeBtn = e.target.closest('[data-dv-mode]');
        if (modeBtn && modal.contains(modeBtn)) {
            const mode = modeBtn.getAttribute('data-dv-mode');
            if (mode !== _dvState.mode) {
                _dvState.mode = mode;
                _dvSyncModeUi(modal);
                if (mode === 'free-text') _dvRenderFreeTextDiff(modal);
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
                try { localStorage.setItem(DV_GRANULARITY_KEY, gran); } catch (_e) { /* no-op */ }
                _dvSyncGranularityUi(modal);
                _dvRenderDiffs(modal);
                if (_dvState.mode === 'free-text') _dvRenderFreeTextDiff(modal);
                Logger.log('diff-viewer: granularity → ' + gran);
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
                _dvAddSlot({ taskId: entry.taskId, key: entry.key, authorName: entry.authorName, authorEmail: entry.authorEmail }, modal);
            }
            return;
        }

        // ── Stash remove ──
        const stashRemove = e.target.closest('[data-dv-stash-remove]');
        if (stashRemove && modal.contains(stashRemove)) {
            e.stopPropagation();
            const idx = parseInt(stashRemove.getAttribute('data-dv-stash-remove'), 10);
            const entry = _dvState.stash[idx];
            if (entry) _dvRemoveFromStash(entry.taskId, modal);
            return;
        }
    });

    // ── Search bar: add task ──
    const searchBtn = _dvQ(modal, 'dv-search-btn');
    const searchInput = _dvQ(modal, 'dv-search-input');
    const doSearch = () => {
        const val = searchInput ? searchInput.value.trim() : '';
        if (!val) return;
        if (!_dvParseInput(val)) {
            _dvSetSearchLoading(modal, false, 'Not a valid task ID, key, version ID, or URL');
            return;
        }
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

    // ── Drag & swap (pointer-based) ──
    modal.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('[data-dv-drag]');
        if (!handle || !modal.contains(handle)) return;
        _dvState.dragFromIdx = parseInt(handle.getAttribute('data-dv-drag'), 10);
        handle.style.cursor = 'grabbing';
    });

    modal.addEventListener('pointerup', (e) => {
        if (_dvState.dragFromIdx === null) return;
        const fromIdx = _dvState.dragFromIdx;
        _dvState.dragFromIdx = null;
        modal.querySelectorAll('[data-dv-drag]').forEach((h) => { h.style.cursor = 'grab'; });
        const targetHandle = e.target.closest('[data-dv-drag]');
        if (targetHandle && modal.contains(targetHandle)) {
            const toIdx = parseInt(targetHandle.getAttribute('data-dv-drag'), 10);
            if (toIdx !== fromIdx) _dvSwapSlots(fromIdx, toIdx, modal);
        }
    });

    // ── Hover diffs (>2 slots: show base removals on hover of compare) ──
    modal.addEventListener('mouseover', (e) => {
        if (_dvState.slots.length <= 2) return;
        const slot = e.target.closest('[data-dv-slot]');
        if (!slot || !modal.contains(slot)) return;
        const idx = parseInt(slot.getAttribute('data-dv-slot'), 10);
        if (idx > 0) _dvApplyHoverDiff(idx, modal);
    });

    modal.addEventListener('mouseout', (e) => {
        if (_dvState.slots.length <= 2) return;
        const slot = e.target.closest('[data-dv-slot]');
        if (!slot || !modal.contains(slot)) return;
        const idx = parseInt(slot.getAttribute('data-dv-slot'), 10);
        if (idx > 0) _dvClearHoverDiff(modal);
    });
}

// ── Inject styles (card action + dv-specific) ──

function _dvInjectStyles() {
    if (document.getElementById('dv-styles')) return;
    const style = document.createElement('style');
    style.id = 'dv-styles';
    style.textContent = [
        '#wf-dash-modal .wf-dash-card-action--add-to-diff {',
        '  width: auto; min-width: 5.5rem; padding: 0 8px;',
        '  background: #7c3aed; color: #fff;',
        '}',
        '#wf-dash-modal .wf-dash-card-action--add-to-diff:hover {',
        '  background: #6d28d9;',
        '}',
        '#wf-dash-modal [data-dv-drag] { cursor: grab; }',
        '#wf-dash-modal [data-dv-drag]:active { cursor: grabbing; }',
        '#wf-dash-modal .dv-slot-base-band {',
        '  flex-shrink: 0;',
        '  height: 18px;',
        '  padding: 2px 10px 0;',
        '  box-sizing: border-box;',
        '  display: flex;',
        '  align-items: center;',
        '}',
        '#wf-dash-modal .dv-slot-base-band--spacer { visibility: hidden; }',
        '#wf-dash-modal .dv-slot-base-badge {',
        '  display: inline-block;',
        '  font-size: 9px;',
        '  font-weight: 700;',
        '  background: var(--brand, #2563eb);',
        '  color: #fff;',
        '  border-radius: 3px;',
        '  padding: 1px 5px;',
        '  letter-spacing: 0.04em;',
        '  line-height: 1.3;',
        '}',
        '#wf-dash-modal .dv-reel {',
        '  display: grid;',
        '  grid-template-columns: 1fr 26px;',
        '  grid-template-rows: ' + DV_REEL_HALF_H + 'px ' + DV_REEL_PEER_H + 'px ' + DV_REEL_LENS_H + 'px ' + DV_REEL_PEER_H + 'px ' + DV_REEL_HALF_H + 'px;',
        '  row-gap: ' + DV_REEL_ROW_GAP + 'px;',
        '  column-gap: 4px;',
        '  flex: 1;',
        '  min-height: 0;',
        '  padding: 6px 4px 6px 6px;',
        '  box-sizing: border-box;',
        '  align-content: start;',
        '}',
        '#wf-dash-modal .dv-reel-half {',
        '  grid-column: 1;',
        '  height: ' + DV_REEL_HALF_H + 'px;',
        '  flex-shrink: 0;',
        '  background: var(--muted, rgba(0,0,0,0.06));',
        '  border-radius: 4px;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  font-size: 9px;',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#wf-dash-modal .dv-reel-half--hidden { visibility: hidden; }',
        '#wf-dash-modal .dv-reel-peer {',
        '  grid-column: 1;',
        '  height: ' + DV_REEL_PEER_H + 'px;',
        '  overflow: hidden;',
        '  padding: 6px 8px;',
        '  background: var(--muted, rgba(0,0,0,0.04));',
        '  border-radius: 4px;',
        '  box-sizing: border-box;',
        '  position: relative;',
        '  opacity: 0.6;',
        '}',
        '#wf-dash-modal .dv-reel-peer--empty { opacity: 0.25; }',
        '#wf-dash-modal .dv-reel-peer pre {',
        '  margin: 0;',
        '  padding: 0;',
        '  white-space: pre-wrap;',
        '  font-family: monospace;',
        '  font-size: 10px;',
        '  line-height: 1.4;',
        '  word-break: break-word;',
        '  overflow: hidden;',
        '  max-height: 100%;',
        '}',
        '#wf-dash-modal .dv-reel-lens {',
        '  grid-column: 1;',
        '  height: ' + DV_REEL_LENS_H + 'px;',
        '  overflow-y: auto;',
        '  overflow-x: hidden;',
        '  padding: 8px 10px;',
        '  background: var(--background, #fff);',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  box-sizing: border-box;',
        '  position: relative;',
        '}',
        '#wf-dash-modal .dv-reel-lens pre {',
        '  margin: 0;',
        '  padding: 0;',
        '  white-space: pre-wrap;',
        '  font-family: monospace;',
        '  font-size: 11px;',
        '  line-height: 1.5;',
        '  word-break: break-word;',
        '}',
        '#wf-dash-modal .dv-reel-version-label {',
        '  position: absolute;',
        '  top: 3px;',
        '  right: 5px;',
        '  font-size: 9px;',
        '  font-weight: 700;',
        '  color: var(--muted-foreground, #64748b);',
        '  pointer-events: none;',
        '  font-family: inherit;',
        '}',
        '#wf-dash-modal .dv-reel-empty-mark {',
        '  font-size: 11px;',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#wf-dash-modal .dv-reel-arrows {',
        '  grid-column: 2;',
        '  grid-row: 3;',
        '  display: flex;',
        '  flex-direction: column;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: 8px;',
        '  align-self: center;',
        '}',
        '#wf-dash-modal .dv-reel-arrow {',
        '  width: 26px;',
        '  height: 26px;',
        '  padding: 0;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 4px;',
        '  cursor: pointer;',
        '  background: var(--card, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  font-size: 13px;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  flex-shrink: 0;',
        '}',
        '#wf-dash-modal .dv-reel-arrow:disabled { opacity: 0.3; cursor: default; }'
    ].join('\n');
    document.head.appendChild(style);
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
    _version: '1.5',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const loader = Context.dashboard && Context.dashboard._loader;
        if (!loader) {
            Logger.error('diff-viewer: dashboard loader not registered');
            return;
        }

        // Load persisted stash
        _dvState.stash = _dvLoadStash();

        // Restore persisted granularity
        try {
            const stored = localStorage.getItem(DV_GRANULARITY_KEY);
            if (stored === 'char' || stored === 'word') _dvState.granularity = stored;
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
                // Restore session slots (if any were captured)
                if (_dvState.slots.length > 0) _dvRenderAll(modal);
            },
            onActivate(modal) {
                _dvRenderAll(modal);
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
