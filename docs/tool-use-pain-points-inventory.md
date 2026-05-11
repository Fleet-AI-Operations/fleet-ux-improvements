# Tool use: open issues and module pain points

Inventory of **open GitHub issues** that mention tool use, verifier, or grading (keyword scan of the open issue list) and of **Fleet Enhancer modules** loaded for tool-use archetypes in `archetypes.json`.

**Update:** `execute-to-current-tool.js` and `toggle-tool-parameters.js` were **deprecated** (moved under each archetype’s `deprecated/`, removed from `archetypes.json`). Fleet now provides **execute-to-current** and **tool parameter** visibility **natively**; this doc still lists the pain points those plugins historically addressed.

**Archetypes in scope:** `tool-use-task-creation`, `tool-use-task-creation-openclaw`, `tool-use-revision`, `qa-tool-use` (production `archetypes` entries plus `devArchetypes` plugins for those ids). `dispute-detail` also shipped the same two plugins until the same deprecation.

---

## Open GitHub issues (tool / verifier / grading)

Issues below were `OPEN` as of the date this file was generated. Most have only auto-generated bodies; the **pain point or request** is taken from the **title** (and archetype hint in the template footer where present).

| # | Title (pain point / request) | Notes |
|---|------------------------------|--------|
| [122](https://github.com/Fleet-AI-Operations/fleet-ux-improvements/issues/122) | Prevent opening tools descriptions when called | Template: global. Unwanted expansion/interaction when tool descriptions open during execution or navigation. |
| [118](https://github.com/Fleet-AI-Operations/fleet-ux-improvements/issues/118) | Hide verifier on tool use QA | Template: `qa-tool-use`. Need to collapse or hide verifier UI during QA review. |
| [117](https://github.com/Fleet-AI-Operations/fleet-ux-improvements/issues/117) | Change verifier output copy to backtick enclosed | Template: `qa-comp-use`. Clipboard format for verifier output (same underlying verifier copy concern as tool-use QA). |
| [115](https://github.com/Fleet-AI-Operations/fleet-ux-improvements/issues/115) | Guidelines format extensions | No body; may relate to guideline copy/links in Request Revisions / QA (unclear vs. other pages). |
| [114](https://github.com/Fleet-AI-Operations/fleet-ux-improvements/issues/114) | Show grading autoclick on verifier run | Template: `qa-comp-use`. Grading panel visibility or automation when verifier runs (related to grading UX on QA). |

---

## Production modules (`archetypes`) — pain point each addresses

### `tool-use-task-creation`

| Module | Pain point addressed |
|--------|----------------------|
| `notes-resize-handle.js` | **“Notes for QA reviewer”** textarea is awkward to edit at default height; need **vertical resize** like a normal resizable field. |
| `source-data-explorer.js` | Understanding **live instance / MCP data** requires parsing JSON or leaving the page; need **“Explore GUI”** to open the real environment in a new tab for inspection (with warning about writes). |
| `tool-results-resize-handle.js` | **Tool result** areas have a **fixed short viewport**; need **drag-to-resize height** (and reset) to read long stdout/JSON. |
| `workflow-cache.js` | **Workflow loss** on clear, error, or **reload**; need **restore last workflow** from cache keyed to the page. |

### `tool-use-task-creation-openclaw`

Shares **notes resize**, **tool results resize**, and **workflow cache** with standard tool use creation. Additionally:

| Module | Pain point addressed |
|--------|----------------------|
| `json-editor-online.js` | Editing or inspecting **large JSON** in-page is painful; need **one-click open JSON Editor Online** (toolbar and optionally per-tool copy-and-open). |
| `text-sanitizer.js` | **Human-readable dates/times and other text** in prompts or params must match **ISO or normalized forms**; need **sanitizer actions** (dropdown + execute) near the prompt workflow. |

### `tool-use-revision`

| Module | Pain point addressed |
|--------|----------------------|
| `prompt-scratchpad.js` | Revising tasks needs **scratch space** (notes, snippets) **without leaving the page**; need **resizable scratchpad** after the prompt. |
| `tool-results-resize-handle.js` | Same as creation: **resize tool result** panes on revision. |

### `qa-tool-use`

| Module | Pain point addressed |
|--------|----------------------|
| `accept-task-modal-improvements.js` | Approving tasks often needs a **quick positive signal** for the worker; **“Motivate worker”** one-click blurbs above optional comments. |
| `copy-verifier-output.js` | **Verifier output** is hard to reuse in feedback or tickets; need **copy** for classic stdout and checklist layouts (including **raw output** when expanded). |
| `hide-grading-autoclick.js` | **Grading UI** clutters or distracts the first-pass QA view; **auto-click “Hide Grading”** once when the control becomes available. |
| `request-revisions.js` | **Request Revisions** flow is slow and error-prone: need **copy prompt**, **copy verifier**, **guideline links**, **prompt quality** controls, and related modal affordances. |
| `request-revisions-screenshot-upload-improvement.js` | Native screenshot upload target is **small and fiddly**; need a **full-width drag / paste / click** zone forwarding to the real file input. |
| `text-sanitizer.js` | Same family of pain as OpenClaw creation: **normalize dates/times and other text** for feedback and fields. |
| `top-nav-horizontal-scroll.js` | QA header **action buttons overflow** the viewport on narrow widths; need **horizontal scroll** on the header strip. |
| `tool-results-resize-handle.js` | Same as creation: **resize tool results** during QA. |
| `useful-links-buttons.js` | **QA Guidelines, Kinesis guidelines, JSON editor** are frequently needed; need **consistent link buttons** (with optional clipboard helpers) near the QA scratchpad area. |

---

## Dev-only modules (`devArchetypes`) — pain point each addresses

These ship in dev archetype builds; several default to **off** in settings.

### `tool-use-task-creation` (dev)

| Module | Pain point addressed |
|--------|----------------------|
| `bug-report-expand.js` | **Bug report** snippets are **line-clamped / truncated**; need **expandable cards** to read full text. |
| `clear-search.js` | Clearing the **tool search** requires selecting all text; need a **clear (X) control** when the box has content. |
| `json-editor-online.js` | Same as OpenClaw production: **JSON Editor Online** integration. |
| `prompt-and-notes-areas.js` | **Prompt vs scratchpad layout** fights the default stack; need **scratchpad anchored to bottom**, **shared resize handle**, optional **remember scratchpad text**. |
| `text-sanitizer.js` | Same as OpenClaw: **text normalization** helpers. |
| `tool-description-truncate.js` | **Tool picker** rows dominated by **long descriptions**; need **truncate / hide description** when collapsed (CSS-only). |
| `workflow-integrity-check.js` | Subtle **workflow bugs** (parameters not grounded in prompt or prior outputs); need a **toolbar check** that validates references. |

### `tool-use-task-creation-openclaw` (dev)

| Module | Pain point addressed |
|--------|----------------------|
| `prompt-and-notes-areas.js` | Same as standard creation dev: **layout + optional persisted scratchpad**. |
| `tool-description-truncate.js` | Same: **shorter tool list rows** in the picker. |

### `tool-use-revision` (dev)

| Module | Pain point addressed |
|--------|----------------------|
| `bug-report-expand.js` | Same: **readable bug reports**. |
| `clear-search.js` | Same: **clear tool search**. |
| `text-sanitizer.js` | Same: **sanitizer** on revision page. |
| `tool-description-truncate.js` | Same: **tool description truncation** in picker. |
| `workflow-cache.js` | Same as production creation/revision cache behavior where loaded for revision **dev** (restore / snapshot tooling). |

### `qa-tool-use` (dev)

| Module | Pain point addressed |
|--------|----------------------|
| `bug-report-expand.js` | Same: **expand bug report** text on QA. |
| `reorganize-request-revisions.js` | **Request Revisions** modal is **long scroll**; optional **two-column layout** with **resizable divider** and remembered ratio. |
| `source-data-explorer.js` | Same as task creation: **Explore GUI** / instance inspection from QA context. |
| `text-sanitizer.js` | Same: **sanitizer** on QA. |
| `tool-description-truncate.js` | Same: **tool picker description** length on QA. |
| `workflow-cache-dev.js` | **Deeper workflow debugging**: observe add/delete/execute, capture snapshots, extra **dev JSON** storage alongside shared cache keys. |
| `workflow-cache.js` | Same production **restore workflow** behavior when enabled in QA dev. |
| `workflow-integrity-check.js` | Same **integrity check** button for workflows under QA. |

---

## Cross-reference: issues ↔ closest existing modules (informal)

| Issue | Closest related module(s) today |
|-------|-----------------------------------|
| #122 (prevent opening tool descriptions when called) | None dedicated; may interact with `tool-description-truncate.js` (display) vs. **collapsible expand** behavior in the app. |
| #118 (hide verifier on tool use QA) | None dedicated; `copy-verifier-output.js` improves copying but does not hide the verifier panel. |
| #117 (verifier copy backticks) | `copy-verifier-output.js` (format differs from issue request). |
| #114 (show grading autoclick on verifier run) | `hide-grading-autoclick.js` does the **opposite default** (hide grading once); issue asks for **show** behavior tied to verifier run. |

This mapping is **not** a commitment that the module fully resolves the issue; it indicates where today’s code touches the same UX area.
