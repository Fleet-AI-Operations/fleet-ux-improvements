# Dashboard live-port handoff

How the **live** dashboard module (`plugins/core/main/dashboard.js`) differs from the
local prototype in `local/dashboard/`. This is a living document — when a future change
to the live module diverges from (or re-syncs with) the prototype, record it here.

The local prototype is the **functional** reference (what the search does, the data flow,
the filter behavior). It is **not** the source of truth for chrome/colors — the live
Fleet site's CSS variables are (see [Styling](#styling)).

---

## Where things live

| Concern | Local prototype | Live module |
|---|---|---|
| Entry point | `src/App.jsx` (Vite app, own page) | Popup overlay opened from the **Ops tab → Team Member Search → "Open Dashboard"** button |
| Data provider | `MockProvider` (fixtures) / `LiveProvider` stub | `Context.opsTab.postgrestGet(table, params)` (real Fleet PostgREST) |
| Auth | `LiveProvider` TODO | Reuses ops-tab's session gathering (see [Auth](#auth)) |
| Team catalog | `src/config/teamCatalog.js` (hardcoded list) | Decrypted ops-secrets `team-uuids` via `Context.opsTab.getSecrets()` |
| Person search | `profiles_all.json` fixture | `profiles` PostgREST `ilike` search + UUID fast-path |
| Bootstrap cache | `localStorage` key `fleet-ux:dashboard-bootstrap` | **Same key/shape** (`{version,updatedAt,projects,environments}`) |
| Styling | Tailwind + `fleet-theme.css` tokens | Inline styles referencing the **site's** CSS variables |

---

## Integration with the Ops tab

- The **"Open Dashboard"** button is rendered by `ops-tab.js` inside the Team Member Search
  section of the Ops pane (`_renderOpsPane`) and wired in `_attachOpsListeners`. It calls
  `Context.dashboard.open()`. The dashboard's behavior lives entirely in `dashboard.js`.
- `dashboard.js` is a **core plugin** (`phase: 'core'`), so it initializes once per page load
  and registers `Context.dashboard = { open, close, toggle, isOpen }`.
- Because the button lives in the Ops pane, the dashboard is only reachable when the Ops tab is
  **enabled and unlocked**, which guarantees `Context.opsTab.postgrestGet` and `getSecrets()`
  are available.

## Auth

No tokens are hardcoded. Data goes through `Context.opsTab.postgrestGet`, a thin wrapper added
to `ops-tab.js` over `_opsPostgrestGet`. That path:

- Reads the Supabase REST base URL + anon key from `Context.networkObserver.getRuntimeAccess()`.
- Reads the user session JWT from `sb-*-auth-token` in localStorage / sessionStorage / cookies
  (same extraction as the people lookup tool).
- Sends `apikey`, `accept-profile: public`, and `authorization: Bearer <session token>`.

This mirrors the "gather cookies/JWTs like the people lookup tool" requirement exactly — it *is*
the same code path.

## Statefulness (per page load)

The popup overlay/modal is built once on first open and **kept in the DOM** (display toggled),
so closing (X, outside click, or Escape) and reopening preserves all inputs, author chips,
selected filters, and loaded results. State resets only on a full page reload.

---

## Functional parity notes (Worker Output Search)

The live module ports the only implemented prototype feature — **Worker Output Search** on the
Tasks tab. Overview / QA / Sessions tabs are present but show "coming soon", matching the
prototype. The QA *output type* lives inside the Tasks tab's search (a checkbox), same as the
prototype.

Ported verbatim (logic): prompt fuzzy/case-sensitive matching (Levenshtein), `created_at` range
validation, version-at-feedback resolution, QA feedback display building (from `feedback_data`,
not `feedback_content`), Fleet URL builders, and the "reload-required vs instant-filter"
distinction (authors / time range / output types reload the cache; team / project / env / prompt
filter instantly).

---

## Oddities / deliberate changes when porting

1. **`created_at` range uses `and=()`.**
   The mock provider used two synthetic params (`created_at_gte` / `created_at_lte`). Real
   PostgREST needs the `created_at` column twice, which a flat query object can't express via
   `URLSearchParams.set`. So a two-sided range is sent as
   `and=(created_at.gte.<iso>,created_at.lte.<iso>)`; one-sided uses `created_at=gte.<iso>` or
   `lte.<iso>`. See `_addCreatedAtRange`.

2. **Project & team *names* are resolved from the bootstrap catalog, not the row.**
   The mock fixtures carried `_mock_project_name` / `_mock_team_name`. The live API does not
   (PostgREST `/teams` 404s; project name isn't on `eval_tasks`). The live module embeds
   `eval_task_projects(project_id)` to get the project **id** client-side, then maps:
   - project id → name via the bootstrapped `task_projects` catalog;
   - `team_id` → name via the ops-secrets `team-uuids` list.
   If a project/team isn't in the catalog (e.g. catalog not yet bootstrapped, or an out-of-catalog
   team), the name renders blank ("—") while ids/links still work.

3. **Client-side project/team/env filtering needs ids on every row.**
   The live `eval_tasks` select adds the non-inner embed `eval_task_projects(project_id)` so each
   task carries its project id for the instant project filter (the mock used `_mock_project_id`).
   `team_id` and `env_key` come straight off the row / current version.

4. **Author resolution = `profiles` ilike + UUID fast-path** (replaces the fixture search).
   - A UUID input is looked up directly (`profiles?id=eq.<uuid>`).
   - Otherwise: `profiles?or=(full_name.ilike.*q*,email.ilike.*q*)&limit=20`.
   - Reserved characters (`(),*`) are stripped from the query before building the `or` filter.
   - **Risk:** if `profiles` RLS restricts broad listing in some environment, name/email search
     could return fewer/zero rows even though the UUID path still works. The QA-feedback model
     doc indicates ops/dashboard callers can read arbitrary workers' data with a valid session, so
     this is expected to work, but it's the most likely thing to revisit if author search misfires.

5. **Team scope for the task-creation query comes from ops-secrets.**
   `_fetchTasksForSearch` filters `eval_tasks` by `team_id=in.(<all catalog teams>)` (mirrors the
   prototype's `TEAM_CATALOG`). If the team catalog is empty (secrets unavailable), the team
   filter is omitted and results fall back to whatever RLS allows.

6. **Bootstrap projects are fetched per-team then unioned.**
   Same approach as the prototype's `runBootstrap`. If there's no team catalog, a single
   unscoped `task_projects` query (`limit=400`) is used instead.

7. **Styling uses inline styles + the site's CSS variables, not Tailwind classes.**
   See [Styling](#styling).

8. **QA feedback select is explicit.**
   The live QA list selects
   `id,created_at,eval_task_id,is_positive_feedback,is_system_feedback,created_by,feedback_data`
   and filters `is_system_feedback=not.eq.true` server-side (the mock filtered system feedback
   client-side). Task metadata, versions, and profiles are fetched in follow-on queries exactly
   like the prototype's `fetchQaFeedbackForWorkerSearch`.

---

## Styling

The prototype uses Tailwind utility classes and `src/styles/fleet-theme.css`. The live module
**does not** ship Tailwind, so it uses inline styles that reference the live site's CSS custom
properties — the same approach as `ops-tab.js`. This guarantees color parity (including automatic
light/dark switching) without depending on which Tailwind classes the site happens to generate.

Variables used (with safe fallbacks): `--background`, `--foreground`, `--muted-foreground`,
`--border`, `--input`, `--card`, `--brand` (falls back to `--primary`), `--primary-foreground`,
`--destructive`. `color-mix(in srgb, …)` produces tinted badge/chip backgrounds from those tokens.

If the site renames or drops a token, the inline fallbacks keep the UI legible; update the
variable names here and in `dashboard.js` if the palette shifts.

## Endpoints used (all documented)

- `profiles` — author resolution + name/email lookup (`local/dashboard/PostgREST/endpoints/profiles.md`)
- `eval_tasks` — task list with `eval_task_versions` + `eval_task_projects(project_id)` embeds
- `eval_task_qa_feedback` — QA reviews performed by worker(s)
- `eval_task_versions` — version history for version-at-feedback resolution
- `task_projects` — bootstrap project catalog
- `environments` — bootstrap environment catalog

## Things intentionally not ported (yet)

- Overview / QA / Sessions tab content (prototype leaves them as placeholders too).
- `sessions`, `verifier_versions`, disputes, and other endpoints — out of scope for Worker
  Output Search.
