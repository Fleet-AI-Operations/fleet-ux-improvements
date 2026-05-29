# Dashboard live-port handoff

Living log of syncs between the **live** module (`plugins/core/main/dashboard.js`) and the **local** prototype (`local/dashboard/`).

Each entry is a brief commit-style note: what changed, which direction (live → local or local → live), and when.

---

## Changelog

### 2026-05-29 — live → local

```
Re-sync local/dashboard with live dashboard.js: modal layout, search/filter UX, task cards.

- App: modal overlay (1120×880), live header/subtitle/tabs; drop preview chrome
- PromptSearch: field order, copy, search lock, always-visible Filters panel, instant filter debounce
- TaskCard/QaFeedbackBlock: Key-only header row, Prompt Version copies task ID, QA header layout
- fleet-theme.css: card+border panels; toggle inactive opacity
```
