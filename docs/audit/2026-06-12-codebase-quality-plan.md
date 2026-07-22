# Fleet UX Codebase Quality Audit — 2026-06-12 (Verified 2026-06-13)

Read-only audit of `fleet.user.js`, `plugins/`, `archetypes.json`, `dev/utils/`, and CI workflows. Every finding below was cross-verified against the live source; status is marked **✅ Confirmed**, **⚠ Partially confirmed** (with corrections), or **❌ Incorrect** (removed).

**Scope:** 84 plugin entries in `archetypes.json` (10 core, 1 dev, 60 archetype, 13 dev-archetype); all 84 files exist on disk; `compute-hashes.sh --dry-run` and `update-versions.sh --dry-run` both clean. No `console.*` in any plugin. No hardcoded JWTs, API keys, or team UUIDs in committed source.

**Note on numbering:** Findings jump from 013 to 016. Numbers 014–015 were not assigned; this is a numbering gap only, not missing findings.

---

## Executive summary

| # | Risk / win | Effort |
|---|---|---|
| 1 | **Worker Output Search has no concurrency control** — overlapping searches can overwrite each other's results and break the PostgREST cache gate. One generation counter fixes the whole class. | M |
| 2 | **Diff viewer can freeze the tab** — word-mode LCS builds an O(m×n) DP table with no token cap. One size guard fixes it. | S |
| 3 | **Per-frame hot-path waste is systemic** — the host reads GM storage for every plugin per frame, the host observer fires plugins on `style`/`class` churn, and three dashboard stat plugins rebuild their entire UI every frame because a dead early-exit was never wired. | S–M |
| 4 | **The host itself violates the no-polling rule and double-fetches config** — disambiguation polls `querySelectorAll('*')` 20×250ms; `archetypes.json` is fetched twice per page load with deliberate cache-busting. | S–M |
| 5 | **Duplication drift is producing live bugs** — a duplicated-listener pattern (`addEventListener` + `CleanupRegistry.registerEventListener` on the same handler) causes every sanitize/execute click to fire twice in three active plugins; a one-sided panel-scope fix in `dispute-detail` was never backported to the QA copies of `copy-verifier-output.js`. | M–L |

Effort bands: **S** (<2 h) · **M** (half day) · **L** (multi-day) · **XL** (architectural)

---

## Findings

> Verification status key: ✅ Confirmed · ⚠ Partially confirmed (corrections inline) · ❌ Incorrect (removed)

---

### P0 — Core dashboard cluster (`plugins/core/main/`)

---

### [FINDING-001] Concurrent search race — stale results overwrite newer search ✅
- **Severity:** critical
- **Category:** race
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (4990–5163, esp. 5078–5157)
- **Problem:** `_submitSearch()` has no generation ID, mutex, or abort. A slow search A can resolve after search B started and write `cachedItems`/rendered view from A's payload while B is in flight.
- **Evidence (verified):** `this._state.searchFetchActive = true` at 5078; `finally` block at 5148–5157 unconditionally sets `searchFetchActive = false` and calls `_refreshResultsView(...)` with no check that this call is still the current search.
- **Fix:** Add `this._state.searchGeneration = 0`; increment at search start (`const gen = ++this._state.searchGeneration`); check `gen === this._state.searchGeneration` before applying results, inside `finally`, and inside `_refreshResultsView`. No behavior change for the single-search case.
- **Files:** `search-output.js`
- **Verification:** Throttle network, fire two searches back-to-back; only the second's results render; no double-clear of loading state.
- **Dependencies:** Pairs with FINDING-002, FINDING-003.

---

### [FINDING-002] `_pgQuery` cache-discipline gate breaks on overlapping searches ⚠
- **Severity:** critical (effectively same root as FINDING-001)
- **Category:** race
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (408–417)
- **Problem (corrected):** `_pgQuery` throws `'PostgREST call blocked'` when `channel` is `'search'` or `'hydrate'` **and** both `searchFetchActive` **and** `hydrateFetchActive` are false. With two overlapping searches, the first to finish sets `searchFetchActive = false`; the second's remaining paged fetches then hit the gate and abort mid-pagination.
- **Evidence (verified at 413–417):**
  ```javascript
  const needsActiveSearch = channel === 'search' || channel === 'hydrate';
  if (needsActiveSearch && !this._state.searchFetchActive && !this._state.hydrateFetchActive) {
      Logger.warn('dashboard: blocked PostgREST call outside search/hydrate — ' + queryKey);
      throw new Error('PostgREST call blocked: data is cached until a new search.');
  }
  ```
- **Fix:** Replace the boolean pair with a reference-counted or generation-gated check: gate open while `activeGeneration !== null` (reusing FINDING-001's counter). Single change lands both findings.
- **Files:** `search-output.js`
- **Verification:** Rapid re-search produces no `'blocked PostgREST call'` warnings in console.
- **Dependencies:** FINDING-001.

---

### [FINDING-003] `dashboard.close()` does not cancel in-flight ops/team-search; no AbortController on search/hydrate fetches ⚠
- **Severity:** high
- **Category:** race / network
- **Priority tier:** P0
- **Location:** `plugins/core/main/dashboard.js` (324–336); `plugins/core/main/ops-tab.js` (2509–2513); `plugins/core/main/search-output.js` (1958–2041, 796–820)
- **Problem (corrected):** `settings-ui._closeModal()` (311–318) does correctly call `Context.opsTab.onModalClosed()`, which aborts in-flight team search. However, `dashboard.close()` (324–336) only hides the overlay and captures state — it does **not** call `onModalClosed()`. Closing the dashboard via its own close button leaves the ops team search running and applying cards to a hidden overlay. Separately, worker-output search, hydrate batches, and dispute bulk fetches have no AbortController path at all.
- **Evidence (verified):** `close()` at dashboard.js 324–335 has no `onModalClosed()` call; `_onOpsModalClosed` (ops-tab 2509–2513) aborts `_opsTeamSearchController`.
- **Fix:** (a) One-line: call `Context.opsTab.onModalClosed()` from `dashboard.close()`. (b) Thread an `AbortSignal` from the generation counter (FINDING-001) through `_fleetWebGet` / `_pgQuery` / hydrate chunks; abort on supersede and on close.
- **Files:** `dashboard.js`, `search-output.js`
- **Verification:** Open dashboard, start a large hydrate, close → network tab shows cancelled requests and no further DOM writes.
- **Dependencies:** FINDING-001 provides the abort signal.

---

### [FINDING-004] Filter/render pipeline rebuilds everything via `innerHTML` with O(options × items) recompute ✅
- **Severity:** high
- **Category:** performance
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (2744–2822, 4354–4421, 5537–5574); `plugins/core/main/dashboard-lib.js` (1007–1083)
- **Problem:** Every filter apply / page change / tab activate: (a) recomputes filter irrelevance and option counts with nested `items.filter(...)` per option in `dashboard-lib.js` 1066–1070 — O(options × items × dimensions); (b) replaces `innerHTML` of every filter multiselect; (c) `_renderResults()` at 5571–5572 does `wrap.innerHTML = pageItems.map(_resultCardHtml).join('')` even for pager-only changes.
- **Evidence (verified at cited lines).**
- **Fix:** Aggregate option counts in one pass over items (O(items × dimensions)); patch checkbox checked-state in-place instead of `innerHTML` rebuild; maintain `Map<itemId, Element>` for card patching (see FINDING-005).
- **Files:** `search-output.js`, `dashboard-lib.js`
- **Verification:** Performance panel: filter interaction latency on 500+ results before/after.
- **Dependencies:** FINDING-005.

---

### [FINDING-005] Bulk hydrate patches each card via full-card scan + HTML regen — O(N²) ✅
- **Severity:** high
- **Category:** performance
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (4472–4496)
- **Problem:** `_patchTaskCard` runs `wrap.querySelectorAll('[data-wf-dash-task-card]')` and linear-scans for `data-item-id` on every call. During bulk hydrate of N cards this is O(N²) DOM work plus N full re-renders via `_resultCardHtml`.
- **Evidence (verified at 4477–4492).**
- **Fix:** Build `Map<itemId, Element>` once per render call; look up directly; batch hydrate DOM updates per chunk rather than per item.
- **Files:** `search-output.js`
- **Verification:** Hydrate 100 items; profile scripting time before/after.
- **Dependencies:** FINDING-004.

---

### [FINDING-006] Unbounded prefetches: 5,000-dispute pull on tab activate; fan-out team search ✅
- **Severity:** high
- **Category:** network
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (34, 942–978, 796–853); `plugins/core/main/ops-tab.js` (3375–3396, 2303–2365)
- **Problem:** (a) Tab activate triggers a resolved-disputes prefetch up to `DASH_DISPUTES_MAX_PAGES = 100` pages × 50 rows across all teams, no date filter, no TTL cache. (b) Ops team search starts a full paginated member search (up to 200 pages) for every team simultaneously (`allTeams.map(async ...)`) — dozens of concurrent POSTs.
- **Fix:** (a) Scope dispute prefetch to default date range; lazy-load on first dispute-inclusive search with TTL cache. (b) Cap team-search concurrency to a pool of 3–5 using a semaphore helper.
- **Files:** `search-output.js`, `ops-tab.js`
- **Verification:** Network request count on tab activate and multi-team search before/after.
- **Dependencies:** None.

---

### [FINDING-007] Per-member expert-stats hydration fires 2 concurrent requests per visible card ✅
- **Severity:** medium
- **Category:** network
- **Priority tier:** P0
- **Location:** `plugins/core/main/ops-tab.js` (1708–1759, esp. 1742–1745)
- **Problem:** `Promise.all([_fetchOpsExpertStats(id, false), _fetchOpsExpertStats(id, true)])` per card at concurrency 5 — 2N requests on render for large rosters.
- **Fix:** Defer stat fetching until the card's `<details>` opens; cache across filter changes (see FINDING-010 correction).
- **Files:** `ops-tab.js`
- **Verification:** Network count for a 50-member roster render.
- **Dependencies:** FINDING-010.

---

### [FINDING-008] Hardcoded PostgREST table names bypass the ops bundle ✅
- **Severity:** high
- **Category:** security / architecture
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (581–585 — `'team_member'`); `plugins/core/main/ops-tab.js` (959–963 — `'task_scenarios'`)
- **Problem:** Both `_dashPostgrestListGet` (search-output 552) and `_opsPostgrestGet` (ops-tab 789–791) build the URL directly as `baseUrl + '/' + table` using a literal table-name string — bypassing `resolveTable`/`postgrestQuery` bundle keys. Project rules require all table access to go through those helpers so table names don't appear in committed plaintext.
- **Evidence (verified at cited lines).**
- **Fix:** Add query keys for `team_member.select_team_catalog` and `task_scenarios.select_by_id` to the ops bundle; route calls through `postgrestQuery`; delete the literal table strings. Re-encrypt bundle with `dev/utils/encrypt-ops-bundle.sh`.
- **Files:** `search-output.js`, `ops-tab.js`, `local/secrets/ops-bundle.json` (→ `ops-secrets.enc.json`)
- **Verification:** Grep `plugins/core/main/` for `'team_member'`, `'task_scenarios'` → zero hits; ops flows work after unlock.
- **Dependencies:** FINDING-009 (duplicate client uses the same pattern).

---

### [FINDING-009] Duplicate Supabase client layer in `search-output.js` ✅
- **Severity:** medium
- **Category:** architecture / network
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (544–604)
- **Problem:** `_dashPostgrestListGet` / `_dashFetchUserTeamCatalog` re-implement JWT + apikey + base-URL assembly that ops-tab already provides, and re-fetch the team catalog that ops-tab caches — a second code path to maintain and a duplicate bootstrap network request.
- **Evidence (verified at 544–567).**
- **Fix:** Replace `_dashPostgrestListGet` and `_dashFetchUserTeamCatalog` with `Context.opsTab.postgrestQuery` / `fetchUserTeamCatalog`; delete the duplicated layer.
- **Files:** `search-output.js`
- **Verification:** One team-catalog request per session in the network tab.
- **Dependencies:** FINDING-008.

---

### [FINDING-010] Unbounded caches and missing state resets ⚠
- **Severity:** medium
- **Category:** lifecycle
- **Priority tier:** P0
- **Location:** `plugins/core/main/ops-tab.js` (1731–1754, 2483); `plugins/core/main/search-output.js` (5226–5235); `plugins/core/main/dashboard-data.js` (134–153)
- **Problem (corrected):**
  - **(a) `_opsExpertStatsCache`** — cleared in `_clearOpsTeamSearchResults()` at **2483**, but **not** cleared in `_onOpsModalClosed()` (2509–2513). Stats from a prior session persist across modal opens within the same page load. Original finding "never cleared" was overstated.
  - **(b) `taskOpenUi`** — `_clearResults()` (5226–5235) resets `cardUi`, `disputeClaimUi`, `hydrateUi`, `userStoryUi` but not `taskOpenUi`, which grows per opened task.
  - **(c) Feedback pagination** — `while (true)` loop at 134–153 has no max-pages cap; exits only when page is smaller than `DASH_DATA_FEEDBACK_PAGE_SIZE`.
- **Fix:** (a) Add `this._opsExpertStatsCache.clear()` in `_onOpsModalClosed`. (b) Add `this._state.taskOpenUi = {}` in `_clearResults`. (c) Add a `maxPages` cap (e.g. 200) with a logged truncation warning.
- **Files:** `ops-tab.js`, `search-output.js`, `dashboard-data.js`
- **Verification:** Heap snapshot across multiple dashboard opens shows stable retained size.

---

### [FINDING-011] Listener/observer cleanup gaps in dashboard host plugins ✅
- **Severity:** medium
- **Category:** lifecycle
- **Priority tier:** P0
- **Location:** `plugins/core/main/dashboard.js` (`_attachListeners()` called from `_build()` at 404 — anonymous `window.resize` listener added with no guard or teardown, around 1505–1515); `plugins/core/main/ops-tab.js` (1235–1278 — document `MutationObserver` + `__next_f.push` patch, no `CleanupRegistry` registration)
- **Problem:** `_attachListeners` is reached via `_build()`; `_ensureBuilt()` normally prevents repeated builds, but when the overlay is disconnected and rebuilt the resize listener stacks. The ops-tab RSC-capture observer is guarded by a flag (`_opsCurrentUserIdCaptureInstalled`) so it only runs once per instance — but it is never disconnected, and `_ensureBuilt` doesn't prevent a new instance.
- **Fix:** Store the resize handler in `this._resizeHandler`; before attaching, remove any existing handler with that ref; register the MutationObserver with `CleanupRegistry` or disconnect after the payload is captured.
- **Files:** `dashboard.js`, `ops-tab.js`
- **Verification:** `getEventListeners(window).resize.length` stays at 1 across dashboard rebuilds.
- **Dependencies:** FINDING-027 makes this systematic.

---

### [FINDING-012] Diff-viewer stale async hydration and duplicate keydown listener ✅
- **Severity:** high
- **Category:** race / lifecycle
- **Priority tier:** P0
- **Location:** `plugins/core/main/diff-viewer.js` (479–509 — `_dvHydrateSlot`; ~915–920 — `document.addEventListener('keydown', ...)` with no guard; 1752–1760 — `ResizeObserver` never disconnected)
- **Problem:** `_dvHydrateSlot` captures `modal` at enqueue, awaits `_dvFetchTask`, then checks only that the slot still exists — not that `modal` is connected or is still the active dashboard modal — before calling `_dvRenderAll(modal)`. `document.addEventListener('keydown', ..., true)` stacks on every dashboard rebuild (no idempotency guard unlike `_dvAttachRollingOverlayListeners`). `ResizeObserver` on `_dvSlotsAreaRo` is never disconnected.
- **Fix:** Before `_dvRenderAll`, check `modal?.isConnected`; add `modal._dvListenersAttached` guard for the keydown path; disconnect `ResizeObserver` on tab deactivate or dashboard rebuild.
- **Files:** `diff-viewer.js`
- **Verification:** Open/close dashboard 5×; keyboard shortcuts fire once; no renders into detached DOM.

---

### [FINDING-013] O(n²) array-includes scans in search assembly and hydrate merge ✅
- **Severity:** low
- **Category:** performance
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js` (2024, 3316–3321)
- **Problem:** `taskIds.includes(item.task.id)` inside a loop over `cachedItems`; `qaTaskIds.includes(id)` inside `.filter`. Both are O(n) per element in an outer iteration.
- **Fix:** `const idSet = new Set(taskIds)` / `const qaSet = new Set(qaTaskIds)` before each loop. Two-line changes.
- **Files:** `search-output.js`
- **Verification:** Code review; behavior identical.

---

### P0 — Core UI plugins (`plugins/core/main/`)

---

### [FINDING-016] Uncapped O(m×n) word-LCS in diff viewer can hang the tab ✅
- **Severity:** critical
- **Category:** performance
- **Priority tier:** P0
- **Location:** `plugins/core/main/diff-viewer.js` (93–104 — `_dvComputeLCS`; 220–228 — `_dvDiffUnits` word path; constant `DV_CHAR_DIFF_LIMIT = 15000` at line 15)
- **Problem (verified):** Char mode falls back at 15k chars — this cap is wired. Word mode has **no** token-count cap. `_dvComputeLCS` allocates `(m+1)×(n+1)` via `Array(m+1).fill(null).map(() => Array(n+1).fill(0))`; large prompts (thousands of tokens each) allocate gigabytes and block the main thread indefinitely.
- **Fix:** In `_dvDiffUnits`, count tokens after tokenizing both texts; if combined count exceeds a cap (e.g. `DV_WORD_DIFF_TOKEN_LIMIT = 20000`), fall back to line-level diff and show a one-shot notice (same pattern as the existing char fallback at 222–225).
- **Files:** `diff-viewer.js`
- **Verification:** Load two ~100 KB prompts into slots; tab stays responsive; notice appears above the diff.

---

### [FINDING-017] Diff recomputation and full slot rebuild on every activate/hover ✅
- **Severity:** high
- **Category:** performance
- **Priority tier:** P0
- **Location:** `plugins/core/main/diff-viewer.js` (1389–1435, 1500–1566, 1213–1240, 2048–2058)
- **Problem:** `onActivate` → `_dvRenderAll` wipes all slot DOM via `innerHTML` then recomputes LCS per compare pair with no content-hash cache. `_dvUpdateAboveLabels` runs a **second** full LCS for the similarity percentage. Rolling-mode `mouseover` per slot calls `_dvRenderDiffs` (full LCS pass over all lenses).
- **Fix:** Cache diff HTML keyed by `(baseText, compareText, granularity, showHighlights)`; reuse the LCS result (return it from `_dvDiffPair`) for the similarity label; on rolling hover, only update `rollingLeft` and patch affected `<pre>` nodes, not the whole render tree.
- **Files:** `diff-viewer.js`
- **Verification:** 4-lens open, hover all slots; Performance panel shows no repeated LCS computation.
- **Dependencies:** FINDING-016 first (cap prevents worst-case cache hits too).

---

### [FINDING-018] `setInterval` presence guards in settings-ui and logger-panel ✅
- **Severity:** high
- **Category:** performance / architecture
- **Priority tier:** P0 (settings-ui), P2 (logger-panel — dev-only)
- **Location:** `plugins/core/main/settings-ui.js` (392–402 — presence guard 1s `setInterval`; 242–251 — pulse animation 1s `setInterval`); `plugins/core/dev/logger-panel.js` (56–60 — same presence pattern)
- **Problem (verified):** Both `this._presenceInterval = setInterval(guard, 1000)` (402) and `state.guardInterval = setInterval(...)` (logger-panel 58) run for the page lifetime. The pulse interval also writes `border`/`box-shadow` via `style.cssText` per tick instead of a CSS animation. All three violate the project no-polling rule.
- **Fix:** Replace presence guards with a single narrow `MutationObserver` on `document.body` (childList; re-inject only when the specific button/panel node is removed). Replace pulse with a `@keyframes` class injected once via `CleanupRegistry.registerElement`.
- **Files:** `settings-ui.js`, `logger-panel.js`
- **Verification:** Performance panel: no `setInterval` timers from these plugins.

---

### P0 — Host (`fleet.user.js`)

---

### [FINDING-019] GM storage read for every plugin on every mutation frame ✅
- **Severity:** high
- **Category:** performance
- **Priority tier:** P0
- **Location:** `fleet.user.js` — call chain: `runMutationPlugins` (2941–2951) → `isArchetypePluginActiveForRun` (2871–2874) → `isEnabled` (2847–2849) → `Storage.getPluginEnabled` (633–637) → `GM_getValue`
- **Problem (verified):** Each rAF-coalesced frame filters mutation plugins by calling `GM_getValue` per plugin. `_archetypeRuntimeActive` is cached at init but `isEnabled` still calls through to `GM_getValue` every time. With 10–15 mutation plugins at up to 60fps that is hundreds of synchronous storage reads per second.
- **Fix:** Add an in-memory `_enabledCache: {}` map to `PluginManager`; populate in `initArchetypeRuntimeEnableState`; invalidate the specific entry in `setEnabled`. `isEnabled` reads from the cache; `GM_getValue` only on cache miss or explicit invalidate.
- **Files:** `fleet.user.js`
- **Verification:** Wrap `GM_getValue` with a counter in a dev build; per-frame reads drop to zero.

---

### [FINDING-020] Host mutation observer triggers plugins on every `style`/`class` attribute change ✅
- **Severity:** high
- **Category:** performance / architecture
- **Priority tier:** P0
- **Location:** `fleet.user.js` (3056–3077)
- **Problem (verified):** Observer watches `{ childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }`. React/Tailwind apps mutate `class`/`style` on hover, transitions, etc. — every such mutation fires `runMutationPlugins()` which calls all active plugins' `onMutation` with no information about what changed. Most plugins only care about structural (childList) changes.
- **Fix (phased):** Phase 1 — in the observer callback, track two dirty flags (`structuralDirty` / `attrOnlyDirty`) and let plugins declare `mutationKinds: ['childList']` (default = both; fully backward compatible); skip attr-only frames for childList-only plugins. Phase 2 (optional) — pass a coarse summary `{ structural, addedCount }` as a third arg to `onMutation`.
- **Files:** `fleet.user.js`; each plugin that wants to opt in adds `mutationKinds: ['childList']`
- **Verification:** Counter per plugin per minute on a busy page; large drop for childList-only plugins.

---

### [FINDING-021] Host archetype disambiguation polls with full-DOM scans; duplicated dev copy; silent wrong-archetype fallback ✅
- **Severity:** high
- **Category:** performance / race / architecture
- **Priority tier:** P0
- **Location:** `fleet.user.js` (1851–1913 — `_disambiguateWithSelectors`; 1992–2053 — identical dev copy; 1872 / 2014 — `document.querySelectorAll('*')` for `text:` checks; 1902–1907 / 2043–2047 — fallback)
- **Problem (verified):** (a) `setTimeout(checkSelectors, 250)` recursive loop up to 20 attempts (~5s max) violates the no-polling rule. (b) `text:` selector check iterates every DOM element with `textContent.trim()` per leaf — O(all elements) per attempt. (c) `tool-use-task-creation` and `tool-use-task-creation-openclaw` share identical `urlPattern`; on disambiguation timeout, `candidates[0]` (generic tool-use) is loaded silently on OpenClaw pages. (d) ~60 lines duplicated between main and dev implementations.
- **Fix:** Replace recursive `setTimeout` with a `MutationObserver` + `setTimeout` fallback that resolves on first match; replace `querySelectorAll('*')` text scan with `document.evaluate` XPath (`//*/text()[normalize-space(.)='...']`); merge main/dev implementations into one `_disambiguateWithSelectors(candidates, resolve, label)` function; emit `Logger.warn` (not silent fall-through) when disambiguation times out.
- **Files:** `fleet.user.js`
- **Verification:** Load OpenClaw page on throttled connection; correct archetype; no 250ms timers.
- **Dependencies:** FINDING-033 (give OpenClaw a distinct URL pattern — simpler and should land first).

---

### [FINDING-022] `archetypes.json` fetched twice per page load; core plugins loaded serially ✅
- **Severity:** high
- **Category:** performance / network
- **Priority tier:** P0
- **Location:** `fleet.user.js` (1669–1744 `loadArchetypes`; calls at 2966 and 2999; serial loop 2507–2538; serial settings docs 2486–2491)
- **Problem (verified):** `startup()` calls `initializeCorePlugins()` then `initializeForPage()`, each of which `await ArchetypeManager.loadArchetypes()`. `loadArchetypes` always fetches with `?t=Date.now()` and the comment at 1670 says "never cache". So every page load makes two sequential uncacheable round trips to raw.githubusercontent.com before any archetype plugin can run. Additionally, core/dev plugins and settings docs are loaded serially (`for...await`), while archetype plugins correctly use `Promise.allSettled`.
- **Fix:** Memoize the in-flight/resolved `loadArchetypes()` promise in a module-level variable (`let _archetypesFetchPromise = null`); second call returns the same promise. Convert `loadPluginsFromConfig` and `loadSettingsModalDocs` to parallel with `Promise.allSettled`.
- **Files:** `fleet.user.js`
- **Verification:** Network log shows one `archetypes.json` request per page load; time to first plugin init measurably lower on cold cache.

---

### [FINDING-023] Production logging defaults are inverted — debug and verbose on by default on main ✅
- **Severity:** medium
- **Category:** performance / style
- **Priority tier:** P0
- **Location:** `fleet.user.js` (62 — `DEFAULT_STORAGE_LOG_VERBOSE = DEV_SCRIPTS_ENABLED ? false : true`; 866 — `Storage.get('debug', true)`)
- **Problem (verified):** On main-like branches, `verbose` (gating `Logger.debug`) defaults to `true`; `debug` (gating `Logger.log`) defaults to `true` on all branches. Production users get the noisiest console. Hot-path calls like `UrlMatcher.matches` log on every URL pattern test (518) with regex serialization in the template string. Dev builds default quieter than prod — backwards.
- **Fix:** Change the `debug` default to `false`; change `DEFAULT_STORAGE_LOG_VERBOSE` to be `false` on main-like branches (swap the condition: `DEV_SCRIPTS_ENABLED ? true : false`). Remote `logs` flags in `archetypes.json` already exist for fleet-wide re-enable.
- **Files:** `fleet.user.js`
- **Verification:** Fresh main install → console shows only `info+` lines until `debug`/`verbose` are enabled.

---

### [FINDING-024] Navigation handler: dropped navigations, early-return skips cleanup, cancelled reload leaves stale plugins ✅
- **Severity:** medium
- **Category:** race
- **Priority tier:** P0
- **Location:** `fleet.user.js` (3119–3199 `handleNavigation`)
- **Problem (verified):** (a) `navigationHandlerActive` guard at 3129–3133 silently drops concurrent navigations with no re-queue. (b) The stale-URL early `return` at 3142–3145 exits before the `try` block's `finally` reaches cleanup/re-init at 3178–3198 — combined with (a), a rapid A→B→C navigation can leave C with no plugins. (c) `requestExtensionReload` (234–248) returns without reloading when the user cancels the confirmation; `handleNavigation` still `return`s at 3167, leaving the old archetype's plugins attached to the new page DOM.
- **Fix:** (a) Track `_pendingNavUrl`; on handler completion check `location.href !== processedUrl` and re-enter for the latest URL. (b) Move cleanup/re-init outside the stale-URL early return. (c) Have `requestExtensionReload` return a boolean; on `false` (cancelled) fall through to the cleanup/re-init path rather than returning.
- **Files:** `fleet.user.js`
- **Verification:** Rapid A→B→C navigations leave C's plugins active; cancelling the reload confirmation clears old plugins.

---

### [FINDING-025] Plugin-specific storage keys and deprecated plugin deletions hardcoded in host ✅
- **Severity:** medium
- **Category:** architecture
- **Priority tier:** P0
- **Location:** `fleet.user.js` (3164–3165 — `workflow-cache-latest*` deletions; 774 — hardcoded archetype ID list `['global', 'qa-tool-use', 'qa-comp-use', 'tool-use-task-creation']`)
- **Problem (verified):** `handleNavigation` deletes `workflow-cache-latest` and `workflow-cache-latest-url` on every SPA reload — keys belonging to the deprecated `workflow-cache` plugin which no longer ships in `main/`. `Storage.clearAll` only clears 4 of ~19 active archetype IDs, missing cache-registry and plugin-order keys for the other 15.
- **Fix:** Remove the workflow-cache deletions from `handleNavigation`. Derive archetype IDs in `clearAll` from `ArchetypeManager.archetypes.map(a => a.id)` instead of the hardcoded list. Let plugins declare `storageKeys: ['my-plugin-cache-key']` for extra cleanup.
- **Files:** `fleet.user.js`
- **Verification:** "Clear all storage" in Settings clears plugin-order keys for every archetype.

---

### [FINDING-026] NetworkObserver fetch hook installed 100ms after document-start ✅ (low)
- **Severity:** low
- **Category:** race
- **Priority tier:** P0
- **Location:** `fleet.user.js` (259 — `SCRIPT_HANDSHAKE_DELAY_MS = 100`; 3224 — `NetworkObserver.init()` inside `runFleet()`; `runFleet` called only from `setTimeout(..., 100)` at 3264/3295)
- **Problem:** Despite `@run-at document-start`, the fetch hook is installed ~100ms late, so the app's earliest Supabase calls escape interception. Mitigated by `FleetSessionAuth` storage scraping, but credential readiness is timing-dependent for early-init plugins.
- **Fix:** Move `NetworkObserver.init()` to run immediately at the outer IIFE level, before the handshake `setTimeout`. Hook install is side-effect-free; only plugin execution needs the handshake delay.
- **Files:** `fleet.user.js`
- **Verification:** Breakpoint on `patchedFleetFetch` — fires before the first app fetch.

---

### [FINDING-027] CleanupRegistry is global — can't release a single plugin's resources ✅
- **Severity:** medium
- **Category:** lifecycle / architecture
- **Priority tier:** P0
- **Location:** `fleet.user.js` (366–426)
- **Problem (verified):** Single `_items` pool torn down by one `cleanup()` call on SPA navigation. Consequences: (a) disabling a plugin mid-session cannot release its observers/listeners; (b) core plugins' registrations are wiped on SPA nav even though core plugins persist; (c) only 2 of 60 archetype `main/` plugins implement `destroy()` — the registry is the only cleanup path and it's all-or-nothing.
- **Fix:** Namespace registrations by plugin id. The factory call already knows the plugin file; wrap the `CleanupRegistry` passed to each factory in a thin proxy that prepends the plugin id to every registration. Add `CleanupRegistry.cleanupFor(pluginId)` called from the Settings toggle-off path. Keep `cleanup()` (clears everything) for SPA navigation.
- **Files:** `fleet.user.js`
- **Verification:** Disable a plugin with injected UI mid-session → its listeners/buttons disappear without a page reload.
- **Dependencies:** Enables FINDING-011, FINDING-031.

---

### P1 — Archetype `main/` plugins

---

### [FINDING-028] `setInterval` polling in `prompt-cache.js` — only active polling violation in archetype `main/` ✅
- **Severity:** high
- **Category:** performance / architecture
- **Priority tier:** P1
- **Location:** `plugins/archetypes/comp-use-task-creation/main/prompt-cache.js` (89–92)
- **Problem (verified):** `state.saveIntervalId = setInterval(() => { if (!state.saveDebounceTimer) this.maybeSave(state); }, 1000)` at 89–92. Interval **is** registered with `CleanupRegistry.registerInterval` (92) and cleared in `teardown` (64–67), so it won't leak past navigation — but it polls every second even when the textarea is idle, violating the no-polling rule. The plugin has no `destroy()` lifecycle hook.
- **Fix:** Delete the `setInterval`; the existing `input` debounce at 81–84 plus a `blur`/`visibilitychange` handler covers all save points. Add `destroy(state) { this.teardown(state); }`.
- **Files:** `prompt-cache.js`
- **Verification:** Type → blur → navigate away → prompt restored; no timer in Performance panel while idle.

---

### [FINDING-029] Dashboard stat plugins: unconditional UI rebuild every mutation frame; dead early-exit in one of three ⚠
- **Severity:** critical
- **Category:** performance
- **Priority tier:** P1
- **Location:** `plugins/archetypes/dashboard/main/feedback-given-stats.js` (170–505); `plugins/archetypes/dashboard/main/task-creation-today-env.js` (204–445); `plugins/archetypes/dashboard/main/disputes-reviewed-today.js` (224–477)
- **Problem (verified — corrected per file):**
  - **`feedback-given-stats.js`**: `statsPayload` is JSON-stringified at 275 and stored in `state.lastStatsPayload` at 505, but the value is never compared before `_wfUpdateUI()` is called at 497–498. The early-exit field exists but is never read.
  - **`task-creation-today-env.js`** and **`disputes-reviewed-today.js`**: No `lastStatsPayload` field exists at all; `_wfUpdateUI()` is called unconditionally at 444–445 and 476–477 respectively.
  - All three rebuild count/breakdown DOM and reset copy-button label text on every coalesced mutation frame on the dashboard, sustaining the loop. This is the single biggest per-frame scripting cost on the dashboard archetype.
- **Fix:**
  - `feedback-given-stats.js`: Add `if (statsPayload === state.lastStatsPayload) return;` before `_wfUpdateUI()`.
  - `task-creation-today-env.js` and `disputes-reviewed-today.js`: Add `state.lastStatsPayload`/`lastRenderSig` to `initialState`; build a JSON.stringify of the stats object before `_wfUpdateUI`; compare and skip when unchanged.
  - All three: stop resetting the copy-button label text in `_wfUpdateUI` on every pass.
- **Files:** `feedback-given-stats.js`, `task-creation-today-env.js`, `disputes-reviewed-today.js`
- **Verification:** Performance trace on the dashboard during row hovering: plugin scripting drops to near zero between data changes.

---

### [FINDING-030] Duplicate event handlers in `text-sanitizer.js` copies — double fire on every click ✅
- **Severity:** high
- **Category:** lifecycle (functional bug)
- **Priority tier:** P1
- **Location:**
  - `plugins/archetypes/qa-tool-use/main/text-sanitizer.js` (487–488)
  - `plugins/archetypes/tool-use-task-creation/main/text-sanitizer.js` (512–513)
  - `plugins/archetypes/tool-use-task-creation-openclaw/main/text-sanitizer.js` (512–513)
  - `plugins/archetypes/dashboard-data-task/main/task-user-story-section.js` (297–304)
  - `plugins/archetypes/dashboard-data-task/main/verifier-code-block.js` (254–261)
- **Problem (verified):** `CleanupRegistry.registerEventListener` **itself calls** `target.addEventListener` (fleet.user.js 390–393). All five files call both the raw `addEventListener` **and** `CleanupRegistry.registerEventListener` with the same target/event/handler — attaching the handler twice. Every sanitize/execute click fires the action twice.
- **Fix:** Delete the raw `addEventListener` line in each of the five files, keeping only the `CleanupRegistry.registerEventListener` call.
- **Files:** 5 files listed above
- **Verification:** Click sanitize button once; handler log line appears once.

---

### [FINDING-031] Document/window capture listeners installed without cleanup across QA and dispute plugins ✅
- **Severity:** high
- **Category:** lifecycle
- **Priority tier:** P1
- **Location:**
  - `qa-tool-use/main/request-revisions-screenshot-upload-improvement.js` (236–253) — `document.addEventListener('paste', ..., true)`, no CleanupRegistry
  - `qa-comp-use/main/request-revisions-screenshot-upload-improvement.js` (236–253) — same
  - `dispute-detail/main/dispute-screenshot-upload-improvement.js` (244–253) — same
  - `qa-tool-use/main/copy-verifier-output.js` (250–301) — window `pointerdown`/`click`, module-level flag, no CleanupRegistry
  - `qa-comp-use/main/copy-verifier-output.js` — same pattern
  - `dispute-detail/main/copy-verifier-output.js` — same pattern
  - `qa-tool-use/main/request-revisions.js` (608–666) — verifier `MutationObserver`s not registered
  - `qa-comp-use/main/request-revisions.js` (608–666) — same
- **Problem (verified for screenshot paste):** Capture-phase listeners on `document`/`window` behind module-level `pasteListenerAttached` / `_copyVerifierWindowCaptureInstalled` flags — installed once, never unregistered with `CleanupRegistry`, never cleared in `destroy()`. They survive SPA cleanup and fire against stale closures after navigation.
- **Fix:** Route every document/window listener through `CleanupRegistry.registerEventListener`; reset the installed flag when the anchor (dialog, verifier panel) leaves the DOM via the host's SPA cleanup or next `onMutation` check.
- **Files:** 8 files listed above
- **Verification:** Navigate away from a QA task; `getEventListeners(document).capture` shows no paste listeners remaining.
- **Dependencies:** FINDING-027 makes this systematic.

---

### [FINDING-032] Ungated per-frame DOM scans in several archetype `onMutation` paths ✅
- **Severity:** medium
- **Category:** performance
- **Priority tier:** P1
- **Location:**
  - `dispute-detail/main/env-load-gate.js` (25–79) — readiness check runs from **both** host `onMutation` and plugin's own body `MutationObserver`
  - `qa-comp-use/main/auto-start-recording.js` (16–41) — `queryAll('button')` every frame until clicked
  - `dashboard-data-expert/main/expert-feedback-tooltip.js` (28–52) and `expert-datasets-task-actions.js` (31–68) — full-document scans, no "done" gate
  - `tool-use-task-creation-openclaw/main/json-editor-online.js` (27–37, 131–214) — tool-card walk every frame when sub-option enabled
  - `copy-verifier-output.js` ×3 (24–67, 124–138) — button/label scan per frame
  - `qa-tool-use/main/request-revisions.js` and `qa-comp-use` copy (90–157, 275–302) — full sync per frame while modal open
  - `dashboard-create-instance/main/clipboard-autofill.js` (31–91) — `querySelectorAll('h2')` + clipboard read scheduled per mutation
- **Problem:** Each is an O(page) scan per mutation frame with no cheap early-exit, compounding FINDING-020 (plugins also fire on attribute-only frames).
- **Fix:** Apply the `lastRunSig` pattern from `grade-question-pasted-text.js` — compute a cheap signature (anchor element identity/count) and early-return when unchanged. For `env-load-gate`, pick host `onMutation` *or* its own observer, not both. For `clipboard-autofill`, move clipboard reads to focus/visibility/paste events.
- **Files:** 8+ files listed above
- **Verification:** Per-plugin `onMutation` duration counters before/after on each archetype.
- **Dependencies:** FINDING-020 reduces the frame trigger rate; this reduces per-call cost.

---

### P0/P2 — Configuration & CI

---

### [FINDING-033] OpenClaw and generic tool-use share identical `urlPattern`; fallback silently loads wrong archetype ✅
- **Severity:** high
- **Category:** architecture (config)
- **Priority tier:** P0
- **Location:** `archetypes.json` (tool-use-task-creation vs tool-use-task-creation-openclaw entries — identical `work/problems/create-tool-use*` pattern, specificity tie at 41); `fleet.user.js` (1902–1907 silent fallback)
- **Problem (verified in archetypes.json):** Disambiguation depends on the OpenClaw `text:` selector appearing within 5s. On slow loads the fallback silently loads the generic tool-use plugin set on OpenClaw pages (wrong `textSanitizer`, wrong DOM anchors).
- **Fix:** Give OpenClaw a more specific URL pattern if the route allows it. If not, change the disambiguation timeout to emit `Logger.warn` plus a visible settings badge, and defer archetype plugins rather than loading the wrong set.
- **Files:** `archetypes.json`; optionally `fleet.user.js` for the fallback behavior
- **Verification:** Throttled OpenClaw page load resolves to the correct archetype.
- **Dependencies:** FINDING-021 (observer-based disambiguation reduces the timeout frequency).

---

### [FINDING-034] No hash verification on direct pushes to `main`; CI bot workflows race each other ✅
- **Severity:** high
- **Category:** CI
- **Priority tier:** P2
- **Location:** `.github/workflows/verify-plugin-hashes-pr.yml` (triggers `pull_request` only); `.github/workflows/update-plugin-hashes.yml` (`branches-ignore: [main]`); `.github/workflows/verify-main-branch-config-pr.yml` (auto-pushes to PR head)
- **Problem (verified):** Hash verification only runs on PR — a direct push or merge to `main` lands with no check. Auto-hash bot ignores `main` explicitly. Two bot workflows (hash update + branch config) both push to the PR head branch without a concurrency group — non-fast-forward race.
- **Fix:** Add a `push: branches: [main]` job to `verify-plugin-hashes-pr.yml` (or set it as a required status check via branch protection). Add `concurrency: group: pr-bot-${{ github.head_ref }}` to both bot workflows or merge them. Chain `verify` to run after the hash bot push via `workflow_run`.
- **Files:** `.github/workflows/verify-plugin-hashes-pr.yml`, `.github/workflows/update-plugin-hashes.yml`, `.github/workflows/verify-main-branch-config-pr.yml`
- **Dependencies:** FINDING-035.

---

### [FINDING-035] `push.sh` does not run `compute-hashes.sh` ✅
- **Severity:** medium
- **Category:** tooling
- **Priority tier:** P2
- **Location:** `dev/utils/push.sh` (298–308 — calls `update-versions.sh`, no `compute-hashes.sh`)
- **Problem (verified):** The primary commit helper bumps versions and runs `update-versions.sh` but never recomputes hashes, making stale hashes easy to push — exactly the failure FINDING-034 would allow through on `main`.
- **Fix:** Append `./dev/utils/compute-hashes.sh` call after `update-versions.sh` in `push.sh`; update the doc note in `docs/development.md` (338–339) from "Note: does not run `compute-hashes.sh`" to reflect the new behavior.
- **Files:** `dev/utils/push.sh`, `docs/development.md`
- **Verification:** Modify a plugin, run `push.sh`, confirm hash updated in the same commit.

---

### [FINDING-036] 14 duplicate plugin `id` values — settings bleed across archetypes ✅
- **Severity:** medium
- **Category:** architecture (config)
- **Priority tier:** P1
- **Location:** e.g. `id: 'textSanitizer'` in `qa-tool-use`, `tool-use-task-creation`, `tool-use-task-creation-openclaw`; `id: 'copyVerifierOutput'` in `qa-tool-use`, `qa-comp-use`, `dispute-detail`; and 8+ more pairs (verified: exact same string in both files of each pair)
- **Problem:** GM storage keys for enabled state, sub-options, and module logging are keyed by plugin `id`. Toggling a plugin off on one archetype silently disables its identically-named copy on every other archetype. May be intentional when copies are meant to share a toggle, but is undocumented and wrong when copies diverge in behavior.
- **Fix:** Decide per family: document shared-toggle intent explicitly in each file's header comment, or scope IDs per archetype (e.g. `qaToolUseTextSanitizer`). If consolidating via FINDING-037, shared IDs become correct by construction.
- **Files:** All affected `main/*.js` copies; storage-key migration shim if IDs change
- **Dependencies:** FINDING-037.

---

### [FINDING-037] Duplication drift across same-named archetype plugins — one-sided bug fixes ✅
- **Severity:** medium
- **Category:** style / architecture
- **Priority tier:** P1
- **Location:**
  - `source-data-explorer.js` (2 copies: `tool-use-task-creation`, `tool-use-revision`) — **byte-identical** (verified via diff)
  - `request-revisions-screenshot-upload-improvement.js` (2 copies: `qa-tool-use`, `qa-comp-use`) — identical
  - `embedded-urlbar-fit.js` (4 copies) — ~97% identical
  - `text-sanitizer.js` (3 copies) — `qa-tool-use` copy lacks `#prompt-editor` / `Problem Description` anchoring fixes present in `tool-use-task-creation`
  - `copy-verifier-output.js` (3 copies) — `dispute-detail` copy has panel-root fallback in `getGradingPanelRoot()` (verified at 141–157) that avoids grabbing the wrong panel; **this fix was not backported to the 2 QA copies** (both end with `return null` at ~140)
  - `request-revisions.js` (2 copies) — `qa-comp-use` adds Copy Result Params (+102 lines)
  - `tool-results-resize-handle.js` (5+ copies) — some missing panel-id reset logic
- **Problem:** Bug fixes land in one copy silently; no tooling alerts reviewers.
- **Fix (short term):** Backport the two confirmed one-sided fixes: (a) copy-verifier panel-root fallback → `qa-tool-use` and `qa-comp-use` copies; (b) text-sanitizer DOM anchoring → `qa-tool-use` copy. (Medium term) Add `dev/utils/sync-shared-plugins.sh` that diffs same-named `main/` files and fails CI on undocumented drift.
- **Files:** `qa-tool-use/main/copy-verifier-output.js`, `qa-comp-use/main/copy-verifier-output.js`, `qa-tool-use/main/text-sanitizer.js`; CI workflow for drift check
- **Verification:** `diff` between family members shows only intentional divergence.
- **Dependencies:** FINDING-036.

---

### [FINDING-038] Config hygiene: stray `log: true`, unwired `plugins/global/`, orphaned dev plugins ✅
- **Severity:** low
- **Category:** config
- **Priority tier:** P2
- **Location:** `archetypes.json` (one `"log": true` entry — `activity-identity-reveal.js` under `task-view`, line ~519); `plugins/global/bug-report-expand.js` + `plugins/global/network-interception.js` (exist on disk, not in `archetypes.json`); `comp-use-task-creation/dev/bug-report-expand.js`, `comp-use-revision/dev/bug-report-expand.js`, `dashboard/dev/progress-prompt-expand.js` (exist on disk, not in any `devArchetypes` list)
- **Fix:** Set `"log": false` in `archetypes.json`. Move both `plugins/global/` files to `deprecated/` (note: `network-interception.js` duplicates the host `NetworkObserver` and should be deleted rather than deprecated; `bug-report-expand.js` can be deprecated). Wire or move the 3 orphaned dev plugins.
- **Files:** `archetypes.json`; `plugins/global/`; 3 dev plugin files
- **Verification:** Every `.js` under `plugins/` (excluding `deprecated/`) is referenced by `archetypes.json`.

---

### [FINDING-039] Tooling fragility: first-match `_version` extraction; `base_ref` unvalidated; docs drift ⚠
- **Severity:** low
- **Category:** tooling / security
- **Priority tier:** P2
- **Location:** `dev/utils/update-versions.sh` (31–36) and `dev/utils/push.sh` (54–61); `.github/workflows/archetypes-boolean-apply.yml` (10–14); `docs/development.md` (188)
- **Problem (corrections):**
  - **(a)(b) Version extraction (confirmed):** `sed` grabs the first `_version:` occurrence in a file. If a comment or string earlier in the file contains `_version`, the wrong value is read.
  - **(c) Docs drift (confirmed — inaccurate):** `docs/development.md` line 188 claims `toggle-core-only-mode.sh` "compute hashes" — it does **not** call `compute-hashes.sh`. Only toggles `coreOnlyMode` and bumps `archetypesVersion`.
  - **(d) `base_ref` (partially confirmed):** workflow_dispatch `base_ref` accepts any ref for checkout; patch JSON content itself is safely jq-validated for boolean-only ops. Lowest-risk fix is an allowlist.
- **Fix:** Anchor `_version` extraction to the plugin object block with a more specific pattern; correct `docs/development.md` line 188; add `base_ref` allowlist regex.
- **Files:** `dev/utils/update-versions.sh`, `dev/utils/push.sh`, `docs/development.md`, `.github/workflows/archetypes-boolean-apply.yml`

---

### [FINDING-040] `highlight-js` evaluates CDN code with no integrity pin or request timeout ✅
- **Severity:** medium
- **Category:** security
- **Priority tier:** P0
- **Location:** `plugins/core/main/highlight-js.js` (73–75)
- **Problem (verified):** `gmFetchText(url)` fetches highlight.js core + python extension from jsDelivr; the concatenated result is passed to `new Function(...)` with no SHA-256 check. Unlike repo plugins (which are hash-verified at load), a CDN compromise would execute arbitrary code in the page for all users. No request timeout.
- **Fix:** Pin an exact version in the URL; compute `PluginLoader.computeHash(fetchedCode)` and compare against a hardcoded expected hash; add a `timeout` to the `GM_xmlhttpRequest` call; fall back to a cached copy on mismatch with a `Logger.error`.
- **Files:** `highlight-js.js`
- **Verification:** Tamper the fetched code (modify one char); plugin refuses to execute and logs an error.

---

### [FINDING-041] God files — `search-output.js` (6,766 lines) and `ops-tab.js` (4,656 lines) ✅ (low)
- **Severity:** low
- **Category:** style / architecture
- **Priority tier:** P0
- **Location:** `plugins/core/main/search-output.js`, `plugins/core/main/ops-tab.js`
- **Problem:** Each file owns bootstrap, orchestration, filtering, rendering, and data access. Helpers (`_buildProfilesMap`, cookie read/write, team-catalog fetch, multiselect HTML) are copy-pasted across the dashboard cluster instead of living in `dashboard-lib.js`.
- **Fix:** After the race/perf fixes (FINDING-001–005), behavior-preserving split of `search-output.js` into orchestrator / render / filters / bootstrap modules loaded as separate core plugins; consolidate shared helpers into `dashboard-lib.js`.
- **Files:** `search-output.js`, `ops-tab.js`, `dashboard-lib.js`
- **Dependencies:** Do last — after FINDING-001…005 to keep diffs reviewable.

---

## Quick wins (implement first, each S)

| # | Finding | Change | Files |
|---|---|---|---|
| 1 | FINDING-029 | Wire `lastStatsPayload` early-exit in 3 dashboard stat plugins | `feedback-given-stats.js`, `task-creation-today-env.js`, `disputes-reviewed-today.js` |
| 2 | FINDING-030 | Remove duplicated `addEventListener` call (keep only registry call) in 5 files | 5 files listed in finding |
| 3 | FINDING-016 | Add `DV_WORD_DIFF_TOKEN_LIMIT` cap in `_dvDiffUnits` | `diff-viewer.js` |
| 4 | FINDING-019 | Add `_enabledCache` to PluginManager; invalidate in `setEnabled` | `fleet.user.js` |
| 5 | FINDING-028 | Delete `setInterval` from `prompt-cache.js`; add `destroy()` | `prompt-cache.js` |
| 6 | FINDING-018 | Replace settings-ui presence/pulse `setInterval` with MutationObserver + CSS `@keyframes` | `settings-ui.js` |
| 7 | FINDING-003a | Call `Context.opsTab.onModalClosed()` from `dashboard.close()` | `dashboard.js` |
| 8 | FINDING-023 | Flip `debug` default to `false`; fix `DEFAULT_STORAGE_LOG_VERBOSE` condition | `fleet.user.js` |
| 9 | FINDING-035 | Append `compute-hashes.sh` to `push.sh` | `dev/utils/push.sh` |
| 10 | FINDING-013 | `Set`-based lookups in search assembly/hydrate merge | `search-output.js` |
| 11 | FINDING-037 (short term) | Backport `copy-verifier` panel-root fix → 2 QA copies; text-sanitizer anchoring → `qa-tool-use` copy | 3 files |
| 12 | FINDING-038 | Set `log: false`, retire `plugins/global/`, fix dev orphans | `archetypes.json`, 2 global files |
| 13 | FINDING-010 (b) | Add `taskOpenUi = {}` to `_clearResults` | `search-output.js` |
| 14 | FINDING-010 (a) | Add `_opsExpertStatsCache.clear()` to `_onOpsModalClosed` | `ops-tab.js` |

---

## Structured roadmap

### Phase 1 — Safe hot-path and correctness fixes (S–M, no architectural changes)

1. All quick wins above.
2. **FINDING-001/002** — search generation counter + gate refactor (M, `search-output.js`)
3. **FINDING-012** — diff-viewer stale-modal guard + keydown idempotency + ResizeObserver disconnect (S–M, `diff-viewer.js`)
4. **FINDING-024** — navigation handler re-queue + cancel-path cleanup (M, `fleet.user.js`)
5. **FINDING-031** — route document/window listeners through CleanupRegistry; reset flags on anchor removal (~6 files, M mechanical)
6. **FINDING-032** — `lastRunSig` early exits in 8 archetype `onMutation` paths (M across multiple files)
7. **FINDING-040** — integrity-pin highlight.js (`highlight-js.js`, S–M)
8. **FINDING-039** — fix docs/development.md line 188; anchor `_version` sed; `base_ref` allowlist (S)
9. **FINDING-025** — remove workflow-cache deletions; expand clearAll archetype list (`fleet.user.js`, S)
10. **FINDING-010 (c)** — add max-pages cap to `_fetchFeedbackBatch` (`dashboard-data.js`, S)

### Phase 2 — Shared infrastructure (M–L)

1. **FINDING-003 (b)** — AbortController/signal plumbing through `_pgQuery` / `_fleetWebGet` / hydrate chunks (`search-output.js`, M)
2. **FINDING-020** — host mutation-kind filter + optional mutation summary (backward compatible, `fleet.user.js`, M)
3. **FINDING-027** — per-plugin CleanupRegistry namespacing + `cleanupFor(id)` (`fleet.user.js`, M–L)
4. **FINDING-022** — memoized archetypes fetch + parallel core-plugin loading (`fleet.user.js`, M)
5. **FINDING-021/033** — observer-based disambiguation, merged main/dev impl, OpenClaw URL fix (`fleet.user.js`, `archetypes.json`, M)
6. **FINDING-006** — dispute prefetch date-scoping; team-search concurrency pool (`search-output.js`, `ops-tab.js`, M)
7. **FINDING-007/010 (a)** — defer expert-stats to `<details>` open + cache lifecycle (`ops-tab.js`, M)
8. **FINDING-008/009** — ops-bundle table keys; delete duplicate client (`search-output.js`, `ops-tab.js`, M)
9. **FINDING-034** — CI hash coverage on `main`; bot workflow concurrency groups (`.github/workflows/`, M)
10. **FINDING-036** — document or scope duplicate plugin IDs (decision + migration shim, L)
11. **FINDING-011** — store/remove resize handler ref; CleanupRegistry for ops-tab observer (`dashboard.js`, `ops-tab.js`, S–M)
12. **FINDING-017** — diff HTML caching keyed by content (`diff-viewer.js`, M–L)
13. **FINDING-026** — move `NetworkObserver.init()` before handshake `setTimeout` (`fleet.user.js`, S)

### Phase 3 — Large refactors (L–XL, after Phase 2 stabilizes)

1. **FINDING-004/005** — incremental filter-count aggregation + `Map<itemId, Element>` card patching (`search-output.js`, `dashboard-lib.js`, L)
2. **FINDING-037 (long term)** — shared-plugin sync/drift CI check or build step (L)
3. **FINDING-041** — behavior-preserving split of `search-output.js` / `ops-tab.js` (XL)

---

## Patterns to adopt repo-wide

- **Generation tokens for every async UI flow.** Capture a monotonic ID at trigger time; check before applying results, in `finally`, and before DOM writes. Reference: ops-tab team search (`sessionId` + `AbortController`).
- **Signature-gated `onMutation`.** Compute a cheap signature first (anchor presence/identity/count); early-return when unchanged. Reference: `grade-question-pasted-text.js` (`lastRunSig`).
- **One listener path.** `CleanupRegistry.registerEventListener` attaches the listener — never pair it with a raw `addEventListener`. Document in `plugin-development.mdc` with the double-fire example.
- **No per-frame storage reads.** GM storage is read at init and settings-change; values are cached in state or `PluginManager` and never read in `onMutation`.
- **Bounded network.** Every pagination loop has a `maxPages` cap with logged truncation. Every fan-out has a concurrency pool. Every fetch tied to a view accepts an `AbortSignal`.
- **Patch, don't rebuild.** Keep a `Map<stableId, Element>`; compare a serialized state payload before wiping `innerHTML`.
- **All table access via ops-bundle keys.** `postgrestQuery`/`resolveTable` only; CI grep for literal table name strings in `main/`.
- **`destroy()` or registry — never neither.** Any plugin that touches `document`/`window` or creates an observer must register it or implement `destroy()`.

---

## Appendix

### Verification summary by finding

| Finding | Verdict | Key correction |
|---------|---------|----------------|
| 001 | ✅ Confirmed | — |
| 002 | ⚠ Partially confirmed | `hydrateFetchActive` also in gate; `channel` param determines applicability |
| 003 | ⚠ Partially confirmed | Gap is specifically in `dashboard.close()`; `settings-ui._closeModal()` correctly wires it |
| 004 | ✅ Confirmed | — |
| 005 | ✅ Confirmed | — |
| 006 | ✅ Confirmed | — |
| 007 | ✅ Confirmed | — |
| 008 | ✅ Confirmed | — |
| 009 | ✅ Confirmed | — |
| 010 | ⚠ Partially confirmed | (a) Cache IS cleared in `_clearOpsTeamSearchResults` (2483); not cleared in `_onOpsModalClosed` only |
| 011 | ✅ Confirmed | Listener is in `_attachListeners()`; `_ensureBuilt` normally guards — stacking on overlay disconnect |
| 012 | ✅ Confirmed | — |
| 013 | ✅ Confirmed | — |
| 014–015 | Not assigned | Numbering gap only |
| 016 | ✅ Confirmed | `DV_CHAR_DIFF_LIMIT = 15000` at line 15; char cap wired; word/LCS cap absent |
| 017 | ✅ Confirmed | — |
| 018 | ✅ Confirmed | — |
| 019 | ✅ Confirmed | — |
| 020 | ✅ Confirmed | — |
| 021 | ✅ Confirmed | Recursive `setTimeout`, not `setInterval`; behavior matches finding |
| 022 | ✅ Confirmed | Comment at 2998 is wrong as stated |
| 023 | ✅ Confirmed | — |
| 024 | ✅ Confirmed | — |
| 025 | ✅ Confirmed | Hardcoded list at line 774 has 4 IDs; ~19 active archetypes |
| 026 | ✅ Confirmed | Delay constant at line 259 |
| 027 | ✅ Confirmed | — |
| 028 | ✅ Confirmed | Interval IS registered with CleanupRegistry — won't leak, but still polling |
| 029 | ⚠ Partially confirmed | Only `feedback-given-stats` has `lastStatsPayload`; other two need field added, not just wired |
| 030 | ✅ Confirmed | Line numbers differ per copy (487–488 in qa copy; 512–513 in task-creation copies) |
| 031 | ✅ Confirmed | — |
| 032 | ✅ Confirmed | — |
| 033 | ✅ Confirmed | — |
| 034 | ✅ Confirmed | — |
| 035 | ✅ Confirmed | — |
| 036 | ✅ Confirmed | — |
| 037 | ✅ Confirmed | `source-data-explorer.js` byte-identical verified; `copy-verifier` panel-root fix confirmed absent in QA copies |
| 038 | ✅ Confirmed | — |
| 039 | ⚠ Partially confirmed | (a)(b) version extraction confirmed; (c) docs line 188 incorrectly claims compute-hashes |
| 040 | ✅ Confirmed | — |
| 041 | ✅ Confirmed | — |

### Won't fix (recommended)
- Committed `opsAccess.passwordHash` (SHA-256): by design; rotate periodically.
- 100ms handshake delay itself: design tradeoff; moving `NetworkObserver.init()` before it (FINDING-026) is the targeted fix.
- `new Function` plugin execution: core to the remote-loading model; SHA-256 hash verification on main-like branches is the mitigation.
- One-shot `setTimeout` uses (copy flash, debounce, toast, observer safety caps): not polling violations, excluded.
