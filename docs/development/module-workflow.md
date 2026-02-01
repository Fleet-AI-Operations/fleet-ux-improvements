# Module Development & Publishing Workflow

This document defines the **step-by-step** workflow for creating, testing, and publishing a module (plugin) in this repo. It is written to be both human- and LLM-readable, with a bias toward LLM clarity and explicit, verifiable steps.

## Scope

- Applies to **modules/plugins** stored under `plugins/`.
- Covers the **branch workflow**: `feature/*` → (optional test branch) → `main`. Helper scripts in `utils/` (`checkout.sh`, `test.sh`, `publish.sh`) automate branch creation and `fleet.user.js` sync.
- Enforces **version sync** across plugin file, `archetypes.json`, and script metadata.
- Requires **separate userscripts per branch** (dev/test/main).

## Glossary

- **Module / Plugin**: A JS file that exports a `plugin` object and is loaded based on `archetypes.json`.
- **Archetype**: A page type (e.g., `tool-use-task-creation`) with its own plugin list.
- **Userscript**: `fleet.user.js` installed in Tampermonkey, which loads plugins from GitHub.

## Repo Structure (Relevant)

```
fleet.user.js
archetypes.json
plugins/
  core/
    main/
    dev/
  archetypes/
    <archetype-id>/
      main/
      dev/
  global/
utils/
  checkout.sh   # Create feature branch and sync fleet.user.js for that branch
  publish.sh    # Merge feature branch into main and sync fleet.user.js for main
  test.sh       # Create test branch to simulate main userscript update experience
docs/
  development/
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
  phase: 'mutation', // or 'init' / 'early'
  initialState: {},
  init(state, context) {},
  onMutation(state, context) {},
  destroy(state, context) {}
};
```

### Architecture Rules (Must Follow)

- Use **observer/event-driven** code. No polling (`setInterval`, recursive `setTimeout` loops).
- Log all critical events with `Logger.*()` and use appropriate log levels.
- Plugin loading lists come **only** from `archetypes.json`.

## Helper Scripts (utils/)

Three scripts in `utils/` automate branch creation and `fleet.user.js` sync so Tampermonkey installs/updates from the correct branch.

| Script | Purpose |
|--------|--------|
| **checkout.sh** | Create a feature branch and sync `fleet.user.js` for that branch. Use when **starting** work on a feature. |
| **test.sh** | Create a test branch from `main` and sync `fleet.user.js` for that branch. Use to **simulate** how main userscript users would experience an update before releasing. |
| **publish.sh** | Merge a feature branch into `main`, sync `fleet.user.js` for main, push, then delete the branch locally and on origin. Use when the feature is **ready for release**. |

All three scripts (when they touch `fleet.user.js`) ensure:

- `@name`: branch prefix (e.g. `[my-feature] Fleet`) or no prefix on `main`
- `@downloadURL` / `@updateURL`: branch segment in the raw GitHub URL
- `GITHUB_CONFIG.branch`: current branch name
- `VERSION`: kept in sync with header `@version`

**checkout.sh** — `./utils/checkout.sh <branch>`

- Creates branch from `main` (branch must not exist locally or on origin).
- Updates `fleet.user.js` for the new branch, commits with message "Sync branch config", pushes.
- Prints the GitHub tree URL; install the userscript from that URL for development.

**test.sh** — `./utils/test.sh <new_branch_name>`

- Requires clean working tree. Branch name must not be `main` and must not exist. Depends on `sync-branch-config.sh` in `utils/` (or `local-utils/` if symlinked/copied).
- Fetches `origin/main`, creates branch from `main`, runs `sync-branch-config.sh` to update `fleet.user.js`, commits and pushes.
- Use to validate an upcoming main release: install the test-branch script, use it as normal, then merge to main with `publish.sh` when satisfied.

**publish.sh** — `./utils/publish.sh <branch>`

- Branch must exist locally and on origin; working tree should be clean.
- Checks out `main`, merges the branch, updates `fleet.user.js` for main (no branch prefix, main URLs), commits "Sync branch config", pushes `main`.
- Deletes the branch locally and on origin (remote delete best-effort).
- After this, the branch-specific userscript can be removed; changes are live on the main userscript.

Run scripts from repo root or from `utils/`.

## Branch Workflow (Canonical)

### 1) Feature Branch (Development)

**Goal**: Implement the module and get it working locally.

Steps:
1. Create branch: run `./utils/checkout.sh feature/<short-name>` (or create `feature/<short-name>` manually and keep `fleet.user.js` in sync for that branch).
2. Add or modify the plugin file under the correct archetype folder:
   - `plugins/archetypes/<archetype-id>/main/<plugin>.js` for production modules.
   - `plugins/archetypes/<archetype-id>/dev/<plugin>.js` for dev-only modules.
   - `plugins/core/main` or `plugins/core/dev` for core modules.
3. Ensure the plugin has a unique `id` and valid lifecycle hooks.
4. Update `archetypes.json`:
   - Add the plugin entry or update its version in the correct archetype list.
5. Update versions (see **Version Synchronization** below).
6. Commit changes to the feature branch.

### 2) Test Branch (Pre-Release Testing)

**Goal**: Test how users on the current main userscript would experience the update before releasing.

Steps:
1. (Optional) Create a test branch from `main`: run `./utils/test.sh <test-branch-name>`. This creates the branch, syncs `fleet.user.js` for that branch, and prints the install URL.
2. Or merge/cherry-pick your feature branch into a branch (e.g. `test-update`) and ensure `fleet.user.js` has the correct `@name`, `@downloadURL`/`@updateURL`, and `GITHUB_CONFIG.branch` for that branch.
3. Install the **test-branch userscript** in Tampermonkey (separate from main).
4. Validate behavior on the real site for the relevant archetype(s).
5. If bugs are found, fix them and repeat.

### 3) Main Branch (Release)

**Goal**: Publish the module.

Steps:
1. Merge the feature (or test) branch into `main`: run `./utils/publish.sh <branch>`. This merges into `main`, syncs `fleet.user.js` for main (no branch prefix, main URLs), pushes `main`, and deletes the branch locally and on origin.
2. Or merge manually and then ensure `fleet.user.js` in `main` has production `@name`, `@downloadURL`/`@updateURL` pointing to `main`, and `GITHUB_CONFIG.branch` set to `main`.
3. Install or update the **main userscript** in Tampermonkey.
4. Verify that the module loads and the feature is enabled.

## Version Synchronization (Required)

When a plugin is changed, **all of the following must be updated and kept in sync**:

1. **Plugin file**: `_version` field inside the plugin.
2. **`archetypes.json`**: the corresponding plugin `version` entry.
3. **`archetypesVersion`**: increment by `0.1` any time a plugin entry changes.
4. **`version`** (top-level): update if the main userscript release changes.

Version increment rules:

- **Minor change**: increment by `0.1`.
- **Major change**: increment by `1.0`.
- Not base-10: `1.9 + 0.1 = 1.10`.

### Version Update Tooling (Optional)

Branch-specific sync of `fleet.user.js` is handled by the helper scripts (`checkout.sh`, `test.sh`, `publish.sh`). Plugin version sync is separate:

- If available: `./utils/update-versions.py` or `./utils/update-archetypes.js` (or equivalent) can auto-update plugin versions in `archetypes.json` and bump `archetypesVersion`.
- Otherwise: **perform version updates manually** (plugin `_version`, `archetypes.json` plugin entry, `archetypesVersion`) and double-check consistency.

## Userscript Installation (Branch-Specific)

Every branch **must have a separate userscript install** in Tampermonkey:

- **Dev script**: `@name` includes `[dev]`, URLs point to `dev`, `GITHUB_CONFIG.branch = 'dev'`.
- **Test script**: `@name` includes `[test]`, URLs point to `test-update`, `GITHUB_CONFIG.branch = 'test-update'`.
- **Main script**: no tag, URLs point to `main`, `GITHUB_CONFIG.branch = 'main'`.

This prevents cross-branch contamination and ensures correct plugin loading.

## Full Checklist (LLM-Friendly)

**Create module (feature branch)**:
1. Run `./utils/checkout.sh feature/<name>` to create the branch and sync `fleet.user.js` (or create the branch manually).
2. Add or edit plugin file in `plugins/...`.
3. Ensure plugin object contract is valid.
4. Update plugin `_version`.
5. Update `archetypes.json` plugin entry and `archetypesVersion`.
6. Commit changes. Install the branch-specific userscript from the URL printed by `checkout.sh` for development.

**Test (test branch)**:
1. Optionally run `./utils/test.sh <test-branch>` to create a test branch from `main` and sync `fleet.user.js`.
2. Or merge feature into a test branch and ensure `fleet.user.js` matches that branch.
3. Install test userscript from the printed URL.
4. Test behavior on target pages.
5. Fix issues and repeat.

**Publish (main branch)**:
1. Run `./utils/publish.sh <branch>` to merge the branch into `main`, sync `fleet.user.js` for main, push, and delete the branch.
2. Or merge manually and confirm `fleet.user.js` points to `main` with production name/URLs.
3. Install/update main userscript.
4. Verify feature in production.

## Troubleshooting

- **Plugin not loading**: confirm plugin entry in `archetypes.json` and version sync.
- **Wrong branch behavior**: ensure Tampermonkey has separate scripts per branch.
- **No logs**: check dev script and confirm `Logger` is enabled in dev builds.
