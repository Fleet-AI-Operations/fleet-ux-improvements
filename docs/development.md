# Module Development & Publishing Workflow

This document defines the **step-by-step** workflow for creating, testing, and publishing a module (plugin) in this repo. It is written to be both human- and LLM-readable, with a bias toward LLM clarity and explicit, verifiable steps.

## Scope

- Applies to **modules/plugins** stored under `plugins/`.
- Covers the **branch workflow**: `feature/*` → (optional test branch) → `main`. Helper scripts in `dev/utils/` automate branch creation, `fleet.user.js` sync, version bumps, and release.
- Enforces **version sync** across plugin file, `archetypes.json`, and script metadata.
- Requires **separate userscripts per branch** (dev/test/main).
- **Prefer the utils scripts for development.** Using them (instead of manual git and edits) keeps `fleet.user.js`, plugin `_version`, and `archetypes.json` in sync and reduces out-of-sync version issues.

## Glossary

- **Module / Plugin**: A JS file that exports a `plugin` object and is loaded based on `archetypes.json`.
- **Archetype**: A page type (e.g., `qa-tool-use`) with its own plugin list, URL pattern, and optional disambiguation selectors.
- **Userscript**: `fleet.user.js` installed in Tampermonkey, which fetches `archetypes.json` and plugins from GitHub at runtime.
- **Core plugin**: Runs on every page regardless of archetype (e.g., settings UI, Ops dashboard).
- **Dev plugin**: Like a core plugin but only loaded on non-main-like branches (e.g., logger panel).
- **Archetype plugin**: Runs only on the matching archetype's URL.

## Repo Structure (Relevant)

```
fleet.user.js
archetypes.json
plugins/
  core/
    main/      # Core plugins (run on every page)
    dev/       # Dev-only core plugins (e.g. logger panel)
  archetypes/
    <archetype-id>/
      main/    # Production archetype plugins
      dev/     # Dev-only archetype plugins
dev/
  utils/
    checkout.sh              # Create feature branch and sync fleet.user.js
    push.sh                  # Version-aware commit and push
    test.sh                  # Create test branch from current state
    update-versions.sh       # Sync archetypes.json and fleet.user.js with plugin _version
    compute-hashes.sh        # Compute and write SHA-256 hashes for all plugins in archetypes.json
    sync-branch-config.sh    # Align fleet.user.js with the current git branch
    apply-archetypes-boolean-patch.sh  # Merge boolean-only edits into archetypes.json
    delete-branch.sh         # Delete the current branch locally and on origin
    toggle-core-only-mode.sh # Toggle coreOnlyMode in archetypes.json
    hash-ops-password.sh     # Generate a hashed ops-tab password
    encrypt-ops-bundle.sh    # Encrypt local/ops-bundle.json → ops-secrets.enc.json
    encrypt-ops-secrets.sh   # Legacy alias for encrypt-ops-bundle.sh
  tools/
    archetypes-flags-tui/    # Interactive TUI to toggle archetypes.json boolean flags
docs/
  settings-modal/            # Markdown docs loaded by the settings UI at runtime
  development.md             # This file
```

## Plugin Contract (Required Shape)

Every plugin exports a `plugin` object with required fields and lifecycle functions. Minimal shape:

```javascript
const plugin = {
  id: 'unique-id',
  name: 'Human-readable name',
  description: 'What it does',
  _version: '1.0',
  enabledByDefault: true,
  phase: 'mutation', // 'early' | 'init' | 'mutation'
  initialState: {},
  init(state, context) {},
  onMutation(state, context) {},
  destroy(state, context) {}
};
```

### Plugin Lifecycle Phases

- **`early`**: Runs before the DOM observer is attached. Use for setup that must happen before `init` plugins.
- **`init`**: Runs once after archetype detection and before the mutation observer starts.
- **`mutation`**: Called on every rAF-coalesced DOM mutation (rapid mutations are batched into one call per animation frame). This is the most common phase.

### Plugin Parameters (Injected at Load)

Each plugin file is executed as a factory function that receives these parameters from the host:

| Parameter | Description |
|-----------|-------------|
| `PluginManager` | Plugin registry and lifecycle controller |
| `Storage` | GM storage wrapper with plugin-cache, sub-option, and settings-doc helpers |
| `Logger` | Shared logger (see logging rules) |
| `Context` | Shared runtime state (archetype, path, version, DOM utils, etc.) |
| `CleanupRegistry` | Register observers/listeners/timers for automatic cleanup on navigation |
| `GM_xmlhttpRequest` | Tampermonkey's XHR API for cross-origin requests |

### Sub-Options

Plugins can declare a `subOptions` array to expose per-plugin toggles in the settings UI. Each sub-option is an object with at minimum `id`, `name`, and `description`. Values are stored in GM storage under `suboption-<pluginId>-<subOptionId>` and read via `Storage.getSubOptionEnabled(pluginId, subOptionId, default)`.

### Architecture Rules (Must Follow)

- Use **observer/event-driven** code. No polling (`setInterval`, recursive `setTimeout` loops).
- Log all critical events with `Logger.*()` and use appropriate log levels.
- Plugin loading lists come **only** from `archetypes.json`.

## archetypes.json Structure

`archetypes.json` is the source of truth for what plugins load, on which archetypes, and with what metadata.

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Must match `fleet.user.js` `VERSION` and `@version` |
| `archetypesVersion` | string | Bumped by `update-versions.sh` whenever plugin entries change |
| `coreOnlyMode` | boolean | When `true`, archetype plugins are skipped; core plugins (settings UI) still run. Toggle with `toggle-core-only-mode.sh`. |
| `logs` | object | Remote log flags: `{ debug, verbose, submodule }`. When set, overrides local GM storage defaults. Used to enable logging for all users without them changing settings. |
| `opsAccess` | object | `{ passwordHash: "sha256-..." }`. Hash for the Ops dashboard password gate. Generate with `hash-ops-password.sh`. |
| `opsSecrets` | object | `{ encryptedFile: "ops-secrets.enc.json" }`. Path (repo root) to the committed encrypted secrets JSON. Plaintext lives in gitignored `local/ops-bundle.json`; encrypt with `encrypt-ops-bundle.sh`. |
| `corePlugins` | array | Core plugins loaded on every page (all branches). |
| `devPlugins` | array | Dev-only core plugins; only loaded on non-main-like branches. |
| `settingsModalDocs` | array | Markdown docs to fetch and cache for the settings modal. Format: `[{ name, version }]`. Files live in `docs/settings-modal/`. |
| `archetypes` | array | Main archetype definitions. |
| `devArchetypes` | array | Dev archetype definitions; only loaded on non-main-like branches. |

### Plugin Entry Fields

Each entry in `corePlugins`, `devPlugins`, and archetype `plugins` arrays:

```json
{
  "name": "plugin-filename.js",
  "version": "1.0",
  "hash": "sha256-<hex>",
  "log": false
}
```

| Field | Description |
|-------|-------------|
| `name` | Plugin filename (no path; resolved relative to the plugin folder) |
| `version` | Must match the plugin file's `_version` field; used for cache invalidation |
| `hash` | SHA-256 integrity hash. **Required on main-like branches** — plugins without a valid hash are blocked. Computed by `compute-hashes.sh`. |
| `log` | When `true` (and `logs.submodule` is on), enables module-specific logging for this plugin. |

### Archetype Entry Fields

```json
{
  "id": "qa-tool-use",
  "name": "QA Tool Use",
  "description": "...",
  "urlPattern": "work/tasks/*",
  "disambiguationSelectors": [],
  "plugins": [ ... ]
}
```

`urlPattern` supports exact match, `/*` segment wildcards, and `*` trailing wildcard. When multiple archetypes match a URL, the most specific pattern wins. `disambiguationSelectors` can hold CSS selectors or `text:<exact text>` values; all must be present in the DOM to confirm the archetype.

## Hash-Based Integrity Verification

All plugins on **main-like branches** (`main`, `test-update`) require a `hash` field in `archetypes.json`. On load:

1. Cached code is verified against the hash before use.
2. Freshly fetched code is verified before being cached and executed.
3. A mismatch **blocks** the plugin (error logged, plugin not run).

On **dev branches**, hash mismatches produce a warning but loading proceeds.

After modifying any plugin file, run `./dev/utils/compute-hashes.sh` to regenerate hashes. This is enforced by CI.

> **Rule (from versioning.mdc):** Whenever you run `update-versions.sh`, also run `compute-hashes.sh` so hashes stay in sync with plugin content.

## Helper Scripts (`dev/utils/`)

Scripts in `dev/utils/` automate branch creation, `fleet.user.js` sync, version bumps, and hash computation so Tampermonkey installs/updates from the correct branch and file versions stay in sync.

**Prefer these scripts for development.** Using them (instead of manual git and hand-editing versions) prevents out-of-sync issues between `fleet.user.js`, plugin `_version` fields, `archetypes.json` versions, and plugin hashes.

| Script | Purpose |
|--------|---------|
| **checkout.sh** | Create a feature branch and sync `fleet.user.js` for that branch. Use when **starting** work on a feature. |
| **push.sh** | Version-aware commit and push: bump versions for changed files if needed, run `update-versions.sh` and `compute-hashes.sh`, then commit and push. Use for **committing** on a branch. |
| **test.sh** | Create a test branch and sync `fleet.user.js` for that branch. Use to **simulate** how main userscript users would experience an update before releasing. |
| **update-versions.sh** | Sync `archetypes.json` and `fleet.user.js` with plugin `_version` values; normalize fleet `@version`/const `VERSION`; bump `archetypesVersion`. Used by `push.sh`; can be run standalone. |
| **compute-hashes.sh** | Compute SHA-256 hashes for all plugin files listed in `archetypes.json` and write them back. Run after `update-versions.sh`. |
| **sync-branch-config.sh** | Align `fleet.user.js` with the current git branch. Used by `checkout.sh` and `test.sh`; safe to run by hand after switching branches. |
| **apply-archetypes-boolean-patch.sh** | Validate and merge boolean-only edits into `archetypes.json`. Used by the Apply archetypes boolean patch GitHub Actions workflow. |
| **delete-branch.sh** | Delete the current branch locally and on origin. Use after a branch has been merged. |
| **toggle-core-only-mode.sh** | Toggle `coreOnlyMode` in `archetypes.json`, then runs `compute-hashes.sh` to keep hashes consistent. |
| **hash-ops-password.sh** | Generate a SHA-256 hash for the Ops dashboard password and print the value to paste into `archetypes.json`. |
| **encrypt-ops-bundle.sh** | Encrypt gitignored `local/ops-bundle.json` with the Ops password into committed `ops-secrets.enc.json` (AES-256-GCM + PBKDF2). `ops-tab.js` decrypts this file at runtime using the password stored on the device. |
| **encrypt-ops-secrets.sh** | Legacy alias; delegates to `encrypt-ops-bundle.sh`. |

Scripts that touch `fleet.user.js` (checkout, test, sync-branch-config) ensure:

- `@name`: branch prefix (e.g. `[my-feature] Fleet`) or no prefix on `main`
- `@downloadURL` / `@updateURL`: branch segment in the raw GitHub URL
- `GITHUB_CONFIG.branch`: current branch name
- `VERSION`: kept in sync with header `@version`

**checkout.sh** — `./dev/utils/checkout.sh [--dry-run] <branch>`

- Creates branch from `main` (branch must not exist locally or on origin). `--dry-run` prints planned changes without modifying anything.
- Updates `fleet.user.js` for the new branch, commits with message "Sync branch config", pushes.
- Prints the GitHub tree URL; install the userscript from that URL for development.

**sync-branch-config.sh** — `./dev/utils/sync-branch-config.sh [-m] [-c] [--dry-run] [--fleet PATH] [--branch NAME]`

- Aligns `fleet.user.js` with the current git branch (`-m` treats the branch as `main`). `-c` commits the file if it changed. `--dry-run` prints the planned field updates without writing. `--fleet` uses a specific file path (default: `<repo>/fleet.user.js`). `--branch` uses a branch name instead of `git` HEAD (ignored when `-m` is set). Used by `checkout.sh` and `test.sh`; safe to run by hand after switching branches.

**apply-archetypes-boolean-patch.sh** — `./dev/utils/apply-archetypes-boolean-patch.sh <archetypes.json> <patch.json>`

- Validates and merges **boolean-only** edits into `archetypes.json` (see header comments for the JSON patch shape). Bumps `archetypesVersion` by `0.1` when any boolean value actually changes. Prints the resulting file to stdout. Used by the **Apply archetypes boolean patch** GitHub Actions workflow.

**archetypes-flags-tui** — `dev/tools/archetypes-flags-tui/`

- Interactive terminal UI (Python + Textual) to fuzzy-search and toggle boolean flags in `archetypes.json`, then confirm and dispatch that workflow on GitHub.
- Setup: `cd dev/tools/archetypes-flags-tui && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` (keep `.venv/` local; it is not tracked.)
- Run: `.venv/bin/python app.py` (repo root must contain `archetypes.json`; `gh auth login` needs **repo** and **workflow** scopes so `gh api` can trigger `workflow_dispatch`).
- Shortcut keys (main screen): type to filter; **Backspace** deletes last character; **Ctrl+W** deletes last word (token); **Ctrl+U** or **Ctrl+Backspace** clears search; **Up/Down** move; **Space** toggles; **Enter** summary; **Esc** returns from the summary screen. On the summary, **Y** + **Enter** dispatches the workflow; **n** + **Enter** cancels.

**push.sh** — `./dev/utils/push.sh [--dry-run] ["optional commit message"]`

- Lists uncommitted changes; for each changed versioned file (plugins, fleet.user.js, settings-modal docs), bumps version by 0.1 if working tree is not already higher than HEAD. Updates `archetypes.json` settingsModalDocs for .md changes.
- Runs `./dev/utils/update-versions.sh` and `./dev/utils/compute-hashes.sh` to sync archetypes and fleet, then `git add -A`, `git commit`, `git push` (only if there is something to commit). Default message: "push.sh auto commit at <date/time>".
- Requires `jq`. Use for normal commits on a branch to keep versions in sync automatically.

**test.sh** — `./dev/utils/test.sh [--dry-run] <new_branch_name>`

- Requires clean working tree. Branch name must not be `main` and must not exist. Depends on `sync-branch-config.sh` in the same directory. `--dry-run` prints planned changes without modifying anything.
- Fetches `origin/main`, creates a new branch from the **current** branch (so non-fleet files stay as on your branch), replaces `fleet.user.js` with `origin/main`'s copy, runs `sync-branch-config.sh` to update `fleet.user.js` for the new branch name, commits and pushes.
- `test-update` is a **main-like branch**: hash verification is enforced, dev plugins are not loaded, and non-dev redirect is not shown. Use to validate an upcoming main release: install the test-branch script, use it as normal, then merge to main when satisfied.

**update-versions.sh** — `./dev/utils/update-versions.sh [--dry-run] [options]`

- Reads `@version` and const `VERSION` from `fleet.user.js`; if they differ, normalizes both to the higher value. Collects `_version` from plugin files, updates `archetypes.json` (corePlugins, devPlugins, archetype plugins, archetypesVersion). Optional args: `--root`, `--plugins-dir`, `--archetypes`, `--fleet`.
- Requires `jq`. Used by `push.sh`; run standalone when you need to sync versions without committing.

**compute-hashes.sh** — `./dev/utils/compute-hashes.sh`

- Computes SHA-256 hashes for all plugin files referenced in `archetypes.json` and writes the `hash` field for each. Must be run after `update-versions.sh` when any plugin file changes. CI enforces that hashes are up to date.

**encrypt-ops-bundle.sh** — `./dev/utils/encrypt-ops-bundle.sh encrypt` (preferred)

Operator-only bundle (PostgREST table/query catalog, Fleet web paths) for the Ops dashboard.

1. Create or update `local/ops-bundle.json` (`local/` is gitignored). Use your local `dev/ops-bundle.example.json` (gitignored) as a schema template, or `./dev/utils/encrypt-ops-bundle.sh decrypt` on a machine that already has the bundle.
2. Put the Ops password in `local/PostgREST/password` (gitignored). Same password unlocks **Enable Ops Dashboard** in Settings.
3. With **Open dashboard when opening settings** enabled (default), the extension gear opens the dashboard when unlocked.
4. Edit `local/ops-bundle.json` when PostgREST query shapes or Fleet web paths change.
5. Run `./dev/utils/encrypt-ops-bundle.sh encrypt` (reads the password file automatically).
6. Run `./dev/utils/hash-ops-password.sh` when the password changes; update `archetypes.json` → `opsAccess.passwordHash`.
7. Commit `ops-secrets.enc.json` at the repo root only. Never commit `local/ops-bundle.json` or `local/PostgREST/password`.

Instructions: `local/PostgREST/OPS-ENCRYPT-INSTRUCTIONS.md` (gitignored).

At runtime, when the Ops dashboard is unlocked, `ops-tab.js` fetches `ops-secrets.enc.json` and decrypts it with the device-stored Ops password. Use `Context.opsTab.getSecrets()` / `getOpsBundle()`, `postgrestQuery(queryKey, overrides)`, `getFleetWebPath(key)`, and `resolveTable(tableKey)` — not literal Supabase table names in plugin source. The fullscreen dashboard is a loader in `dashboard.js` with tab modules `search-output.js` (Worker Output Search), `team-members.js`, and `verifier-fetcher.js`; shared helpers live in `dashboard-lib.js` and `dashboard-data.js`.

`./dev/utils/encrypt-ops-bundle.sh decrypt` prints decrypted JSON for local verification.

**encrypt-ops-secrets.sh** — legacy alias; delegates to `encrypt-ops-bundle.sh`.

Run all scripts from repo root.

### GitHub raw cache (Tampermonkey updates)

GitHub caches raw file content (e.g. `raw.githubusercontent.com`) for about **5 minutes**. If you push changes and Tampermonkey checks for updates sooner than that, it may receive the previous cached version. Updating files faster than the cache TTL can cause unexpected behavior (e.g. script or plugin versions not matching what you just pushed) if you are not aware of this. After pushing, wait at least a few minutes before relying on "Check for updates" in Tampermonkey, or reinstall the userscript from the branch URL to force a fresh fetch.

## Branch Workflow (Canonical)

### Branch Modes

| Branch type | `MAIN_LIKE_BRANCHES` | Hash required | Dev plugins | Dev redirect |
|-------------|----------------------|---------------|-------------|--------------|
| `main` | ✓ | Yes (blocks) | No | No |
| `test-update` | ✓ | Yes (blocks) | No | No |
| `feature/*` (any other) | ✗ | No (warns) | Yes | Yes (non-devs) |

### 1) Feature Branch (Development)

**Goal**: Implement the module and get it working locally.

Steps:
1. Create branch: run `./dev/utils/checkout.sh feature/<short-name>` (or create `feature/<short-name>` manually and keep `fleet.user.js` in sync for that branch).
2. Add or modify the plugin file under the correct archetype folder:
   - `plugins/archetypes/<archetype-id>/main/<plugin>.js` for production modules.
   - `plugins/archetypes/<archetype-id>/dev/<plugin>.js` for dev-only modules.
   - `plugins/core/main` or `plugins/core/dev` for core modules.
3. Ensure the plugin has a unique `id` and valid lifecycle hooks.
4. Update `archetypes.json`:
   - Add the plugin entry or update its version in the correct archetype list.
5. Update versions (see **Version Synchronization** below). Prefer `./dev/utils/push.sh ["commit message"]` to commit and push: it bumps versions for changed files and runs `update-versions.sh` so `archetypes.json` and fleet stay in sync.
6. Commit changes to the feature branch (or use `push.sh` for version-aware commit and push).

### 2) Test Branch (Pre-Release Testing)

**Goal**: Test how users on the current main userscript would experience the update before releasing.

Steps:
1. (Optional) Create a test branch: run `./dev/utils/test.sh <test-branch-name>`. This creates the branch with `fleet.user.js` from `origin/main` (synced for the new branch name) and prints the install URL.
2. Or merge/cherry-pick your feature branch into a branch (e.g. `test-update`) and ensure `fleet.user.js` has the correct `@name`, `@downloadURL`/`@updateURL`, and `GITHUB_CONFIG.branch` for that branch.
3. Install the **test-branch userscript** in Tampermonkey (separate from main).
4. Validate behavior on the real site for the relevant archetype(s). The test branch runs in main-like mode: hash verification enforced, no dev plugins, no dev redirect modal.
5. If bugs are found, fix them and repeat.

### 3) Main Branch (Release)

**Goal**: Publish the module.

Steps:
1. Merge the feature (or test) branch into `main` manually (no release script exists; use a GitHub PR or `git merge`).
2. Ensure `fleet.user.js` in `main` has production `@name`, `@downloadURL`/`@updateURL` pointing to `main`, and `GITHUB_CONFIG.branch` set to `main`. Run `./dev/utils/sync-branch-config.sh -m -c` to align and commit automatically.
3. Run `./dev/utils/compute-hashes.sh` and commit any hash updates.
4. Push `main`.
5. Install or update the **main userscript** in Tampermonkey.
6. Verify that the module loads and the feature is enabled.

After merging, delete the feature branch with `./dev/utils/delete-branch.sh` (run from the feature branch before switching to main, or pass the branch name).

## Version Synchronization (Required)

When a plugin is changed, **all of the following must be updated and kept in sync**:

1. **Plugin file**: `_version` field inside the plugin.
2. **`archetypes.json`**: the corresponding plugin `version` entry.
3. **`archetypes.json`**: plugin `hash` field (run `compute-hashes.sh`).
4. **`archetypesVersion`**: increment by `0.1` any time a plugin entry changes.
5. **`version`** (top-level): update if the main userscript release changes.

Version increment rules:

- **Minor change**: bump the second segment by `0.1` (segment-wise, not base-10 decimal): e.g. `3.0` → `3.1`, `1.9 + 0.1` → `1.10`.
- **Major change**: bump the first segment by `1` and set the second segment to **`0`**: e.g. `2.12` → `3.0`, `5.3` → `6.0`.

### Version Update Tooling

Branch-specific sync of `fleet.user.js` is handled by the helper scripts (`checkout.sh`, `test.sh`, `sync-branch-config.sh`). Plugin and archetype version sync is handled by:

- **`./dev/utils/update-versions.sh`**: Syncs `archetypes.json` with plugin `_version` values and fleet `@version`/const `VERSION`; bumps `archetypesVersion`. Run standalone or via `push.sh`.
- **`./dev/utils/compute-hashes.sh`**: Computes and writes SHA-256 hashes for all plugins. **Always run this after `update-versions.sh`.** CI enforces hash freshness.
- **`./dev/utils/push.sh`**: Version-aware commit and push: bumps versions for changed files (plugins, fleet, settings-modal docs) if needed, runs `update-versions.sh` and `compute-hashes.sh`, then commits and pushes. **Prefer `push.sh` when committing** to keep versions and hashes in sync automatically.
- Otherwise: perform version updates manually (plugin `_version`, `archetypes.json` plugin entry, hash, `archetypesVersion`) and double-check consistency.

## Userscript Installation (Branch-Specific)

Every branch **must have a separate userscript install** in Tampermonkey:

- **Dev script**: `@name` includes `[branch-name]`, URLs point to the feature branch, `GITHUB_CONFIG.branch = '<branch>'`. Dev plugins load. Non-devs see redirect modal.
- **Test-update script**: `@name` includes `[test-update]`, URLs point to `test-update`, `GITHUB_CONFIG.branch = 'test-update'`. Runs in main-like mode.
- **Main script**: no tag, URLs point to `main`, `GITHUB_CONFIG.branch = 'main'`. Main-like mode.

This prevents cross-branch contamination and ensures correct plugin loading.

## Runtime Services (fleet.user.js Internals)

These are host-level objects available to plugins via `Context` or passed as parameters. Plugins do not import or instantiate them directly.

### Logger

Shared logger accessible as the `Logger` parameter inside plugins.

- **Levels**: `debug`, `log`, `info`, `warn`, `error` — follow rules in `plugin-development.mdc`.
- **Module logger**: Use `Logger.createModuleLogger(pluginId)` to get a logger that only emits when submodule logging is enabled for that plugin. Passed automatically to archetype plugins; core and dev plugins receive the global `Logger`.
- **Remote flags**: `archetypes.json` `logs` object (`debug`, `verbose`, `submodule`) can override local GM storage defaults. Setting `log: true` on an individual plugin entry enables its module logger when `submodule` is also on.

### NetworkObserver

Installed at startup. Intercepts page `fetch` calls to:
- Discover and cache the Supabase REST base URL, anon key, and project ref from live network traffic.
- Expose these to plugins via `Context.networkObserver.getRuntimeAccess()`.
- Allow plugins to subscribe for request/response notifications on matching URLs.

Plugins that need to make Supabase API calls should read credentials from `Context.networkObserver.getRuntimeAccess()` rather than hardcoding them.

### RefreshGuard

Optional user-configurable guard that intercepts page unload events and `location.reload()` calls.

- **Two independent settings**: "page refresh confirmation" (for site-native navigations) and "extension refresh confirmation" (for reloads initiated by the userscript or plugins).
- Both default to **off** (native browser behavior).
- Plugins that trigger a reload should call `Context.refreshGuard.requestExtensionReload(reason)` so the correct confirmation dialog is shown if enabled.

### CleanupRegistry

Passed as a parameter to plugins. Register observers, event listeners, intervals, and injected DOM elements here so they are automatically torn down on SPA navigation.

```javascript
// In a plugin:
CleanupRegistry.registerObserver(myMutationObserver);
CleanupRegistry.registerEventListener(btn, 'click', handler);
```

### SPA Navigation

`fleet.user.js` hooks `history.pushState`, `history.replaceState`, and `popstate`. On navigation:

1. If the new URL matches an archetype with configured plugins (main or dev), the page is **fully reloaded** so the new archetype's plugins can load cleanly.
2. If no configured plugins match the new URL, cleanup runs and `initializeForPage()` reruns without a reload.

The reload threshold is determined by `navigationTargetHasConfiguredPlugins()`, which checks both main and dev archetypes.

## Full Checklist (LLM-Friendly)

**Create module (feature branch)**:
1. Run `./dev/utils/checkout.sh feature/<name>` to create the branch and sync `fleet.user.js` (or create the branch manually).
2. Add or edit plugin file in `plugins/...`.
3. Ensure plugin object contract is valid (id, _version, phase, lifecycle hooks).
4. Update plugin `_version` (or let `push.sh` bump it). Update `archetypes.json` / `archetypesVersion` via `./dev/utils/update-versions.sh` or `./dev/utils/push.sh`.
5. Run `./dev/utils/compute-hashes.sh` to update the `hash` field for changed plugins.
6. Prefer `./dev/utils/push.sh ["commit message"]` to commit and push so versions stay in sync.
7. Install the branch-specific userscript from the URL printed by `checkout.sh` for development.

**Test (test branch)**:
1. Optionally run `./dev/utils/test.sh <test-branch>` to create a test branch from `main` and sync `fleet.user.js`.
2. Or merge feature into a test branch and ensure `fleet.user.js` matches that branch.
3. Ensure hashes are up to date (`./dev/utils/compute-hashes.sh`) — test-update is main-like and enforces hashes.
4. Install test userscript from the printed URL.
5. Test behavior on target pages.
6. Fix issues and repeat.

**Publish (main branch)**:
1. Merge the feature/test branch into `main` (via PR or `git merge`).
2. Run `./dev/utils/sync-branch-config.sh -m -c` to align `fleet.user.js` for main and commit.
3. Run `./dev/utils/compute-hashes.sh` if any plugin content changed; commit if hashes changed.
4. Push `main`.
5. Install/update main userscript.
6. Verify feature in production.
7. Delete the branch: `./dev/utils/delete-branch.sh`.

## Troubleshooting

- **Plugin not loading**: confirm plugin entry in `archetypes.json`, version sync, and hash field is present and correct.
- **Plugin blocked on main**: missing or invalid `hash` in `archetypes.json`. Run `./dev/utils/compute-hashes.sh` and push.
- **Wrong branch behavior**: ensure Tampermonkey has separate scripts per branch.
- **No logs**: check dev script and confirm `Logger` is enabled in dev builds. On main, set `logs.debug: true` in `archetypes.json` temporarily.
- **Tampermonkey shows old script/plugin after push**: GitHub caches raw content for ~5 minutes. Wait a few minutes before "Check for updates", or reinstall the userscript from the branch URL.
- **Non-dev redirect modal on feature branch**: the dev-ID userscript (`fleet-dev-id.user.js`) must set the correct branch key in localStorage. Install it and reload.
