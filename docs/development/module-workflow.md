# Module Development & Publishing Workflow

This document defines the **step-by-step** workflow for creating, testing, and publishing a module (plugin) in this repo. It is written to be both human- and LLM-readable, with a bias toward LLM clarity and explicit, verifiable steps.

## Scope

- Applies to **modules/plugins** stored under `plugins/`.
- Covers the **branch workflow**: `feature/*` → `test-update` → `main`.
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

## Branch Workflow (Canonical)

### 1) Feature Branch (Development)

**Goal**: Implement the module and get it working locally.

Steps:
1. Create branch: `feature/<short-name>`.
2. Add or modify the plugin file under the correct archetype folder:
   - `plugins/archetypes/<archetype-id>/main/<plugin>.js` for production modules.
   - `plugins/archetypes/<archetype-id>/dev/<plugin>.js` for dev-only modules.
   - `plugins/core/main` or `plugins/core/dev` for core modules.
3. Ensure the plugin has a unique `id` and valid lifecycle hooks.
4. Update `archetypes.json`:
   - Add the plugin entry or update its version in the correct archetype list.
5. Update versions (see **Version Synchronization** below).
6. Commit changes to the feature branch.

### 2) Test-Update Branch (Pre-Release Testing)

**Goal**: Test the module while keeping `fleet.user.js` aligned to `main`.

Steps:
1. Merge or cherry-pick your feature branch into `test-update`.
2. Ensure `fleet.user.js` **matches main** except for:
   - `@name` (should indicate test branch)
   - `@downloadURL` / `@updateURL` (should point to `test-update`)
   - `GITHUB_CONFIG.branch` (set to `test-update`)
3. Install the **test-update userscript** in Tampermonkey (separate from dev/main).
4. Validate behavior on the real site for the relevant archetype(s).
5. If bugs are found, fix them in `test-update` and repeat.

### 3) Main Branch (Release)

**Goal**: Publish the module.

Steps:
1. Merge `test-update` into `main`.
2. Confirm `fleet.user.js` in `main`:
   - `@name` reflects production (no dev/test marker).
   - `@downloadURL` / `@updateURL` point to `main`.
   - `GITHUB_CONFIG.branch` is `main`.
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

### Planned Tooling (Upcoming)

These scripts are being added and should be used when available:

- `./utils/update-versions.py` or `./utils/update-archetypes.js`
  - Will auto-update plugin versions in `archetypes.json`.
  - Will bump `archetypesVersion` automatically.
- Branch safety checks:
  - Verify `fleet.user.js` in `main` points to `main`.
  - Verify `test-update` points to `test-update`.
  - Validate `@downloadURL` / `@updateURL` match the branch.

Until these exist, **perform version updates manually** and double-check consistency.

## Userscript Installation (Branch-Specific)

Every branch **must have a separate userscript install** in Tampermonkey:

- **Dev script**: `@name` includes `[dev]`, URLs point to `dev`, `GITHUB_CONFIG.branch = 'dev'`.
- **Test script**: `@name` includes `[test]`, URLs point to `test-update`, `GITHUB_CONFIG.branch = 'test-update'`.
- **Main script**: no tag, URLs point to `main`, `GITHUB_CONFIG.branch = 'main'`.

This prevents cross-branch contamination and ensures correct plugin loading.

## Full Checklist (LLM-Friendly)

**Create module (feature branch)**:
1. Create `feature/<name>` branch.
2. Add or edit plugin file in `plugins/...`.
3. Ensure plugin object contract is valid.
4. Update plugin `_version`.
5. Update `archetypes.json` plugin entry and `archetypesVersion`.
6. Commit changes.

**Test (test-update branch)**:
1. Merge feature → `test-update`.
2. Keep `fleet.user.js` aligned to `main` except branch metadata.
3. Install test userscript.
4. Test behavior on target pages.
5. Fix issues and repeat.

**Publish (main branch)**:
1. Merge `test-update` → `main`.
2. Confirm `fleet.user.js` points to `main` and has production name/URLs.
3. Install/update main userscript.
4. Verify feature in production.

## Troubleshooting

- **Plugin not loading**: confirm plugin entry in `archetypes.json` and version sync.
- **Wrong branch behavior**: ensure Tampermonkey has separate scripts per branch.
- **No logs**: check dev script and confirm `Logger` is enabled in dev builds.
