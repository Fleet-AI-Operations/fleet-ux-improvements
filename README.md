# Fleet Workflow Builder UX Enhancer

Custom userscript to enhance the web UX for Fleet problem creation and review workflows.

---

## Installation Instructions

### Step 1: Install a Userscript Manager

This script requires a userscript manager browser extension. **Tampermonkey** is recommended as this script was developed and tested with it.

**Download Tampermonkey:**
- [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
- [Safari](https://apps.apple.com/app/tampermonkey/id1482490089)
- [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### Step 2: Enable Developer Mode (If Required)

Some browsers require developer mode to be enabled and may prompt for Tampermonkey permissions. Follow the instructions for your browser:

**Chrome:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** on (switch in the top-right corner)
3. If Tampermonkey requires permissions, grant them here

**Firefox:**
- Firefox does not require developer mode for installing extensions from the official add-on store
- If you need to install unsigned extensions, go to `about:config` and set `xpinstall.signatures.required` to `false` (not recommended for security reasons)

**Microsoft Edge:**
1. Open Edge and navigate to `edge://extensions/`
2. Toggle **Developer mode** on (switch in the left sidebar)
3. If Tampermonkey requires permissions, grant them here

**Safari:**
1. Open Safari and go to **Safari** → **Settings** (or **Preferences** on older versions)
2. Click the **Advanced** tab
3. Check the box for **Show Develop menu in menu bar**
4. Go to **Develop** → **Allow Unsigned Extensions** (if needed)
5. Note: Safari extensions must be installed from the Mac App Store or signed by a developer

### Step 3: Install the Script

**Option A: Direct Install (Recommended)**

Click the link below to install the script directly:
- [Install Fleet UX Enhancer](https://raw.githubusercontent.com/adastra1826/fleet-ux-improvements/main/fleet.user.js)

Tampermonkey will open an installation prompt. Click **Install** to add the script.

**Option B: Manual Install**

1. Open Tampermonkey in your browser and go to the **Dashboard**
2. Click the **+** tab (or "Create a new script")
3. Delete any template code
4. Copy the contents of `fleet.user.js` and paste it into the editor
5. Press `Ctrl+S` (or `Cmd+S` on Mac) to save

### Step 4: Grant Permissions

When you first visit a Fleet page with the script active, Tampermonkey may ask for additional permissions:

- **Cross-origin requests to `raw.githubusercontent.com`**: Required to load plugins from GitHub. Click **Allow** when prompted.

If the script doesn't seem to be working:
1. Click the Tampermonkey icon in your browser toolbar
2. Ensure the script is **enabled** (toggle should be on)
3. Check that the script is allowed to run on `https://fleetai.com/*`
4. Refresh the page

---

## Features

The extension uses an archetype-based plugin system that loads different features depending on which page you're on. Plugin configuration and versions are managed in `archetypes.json`.

Many of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!

### Main Dashboard
- **Progress Prompt Expand**: Hover over My Progress task items to expand truncated prompts (with option to click to copy, or keep all expanded)
- **Feedback Given Approval Rate**: Show approval rate on the Feedback Given stat when both approved and feedback-requested counts exist
- **Feedback Given Today and Environment**: Show today's feedback count and environment breakdown under Feedback Given; indicate when list may be incomplete
- **Task Creation Today and Environment**: Show today's task creation count and environment breakdown below the Submitted/Awaiting Review/Accepted grid; indicate when list may be incomplete

### QA Project Picker Page
- **Auto Sort Available QA Tasks**: Sort and organize the available QA tasks list for quicker scanning

### Tool Use Task Creation Page
- **Favorites**: Star frequently-used tools to help find them quickly (persists between sessions)
- **Execute to Current Tool**: Button to execute all tools from the beginning up to and including the current tool
- **Workflow Cache**: Cache workflow state for faster reloads and recovery
- **JSON Editor Online**: Button that links to JSON Editor Online for JSON manipulation
- **Guideline Buttons**: Quick links to guidelines below the prompt area
- **Clear Search**: One-click clear for search inputs
- **Remove Textarea Gradient**: Cleaner textarea appearance
- **Remember Layout Proportions**: Persists and restores the main panel split positions between sessions
- **Prompt and Notes Areas Layout**: Anchors scratchpad to bottom and makes prompt handle control both areas (with option to remember scratchpad text)
- **Toggle Tool Parameters**: Collapse/expand tool parameters (with option to auto-collapse on execute)
- **Tool Results Resize Handle**: Resizable tool results area
- **Tool description truncation**: Truncate long tool descriptions (with option to hide when collapsed)
- **Text Sanitizer**: Sanitize and normalize text in workflow-related fields

### Tool Use Task Revision Page
- **Favorites**: Star frequently-used tools (persists between sessions)
- **Execute to Current Tool**: Execute all tools from the start up to and including the current tool
- **Workflow Cache**: Cache workflow state for faster reloads and recovery
- **Prompt Scratchpad**: Scratchpad for notes while revising
- **Guideline Buttons**: Quick links to Fleet guidelines
- **Clear Search**: One-click clear for search inputs
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Toggle Tool Parameters**: Collapse/expand tool parameters (with option to auto-collapse on execute)
- **Tool Results Resize Handle**: Resizable tool results area
- **Tool description truncation**: Truncate long tool descriptions (with option to hide when collapsed)
- **Text Sanitizer**: Sanitize and normalize text in workflow-related fields
- **Prompt Diff Highlighting**: Highlight differences in prompt content when comparing versions

### Computer Use Task Creation Page
- **Prompt Scratchpad**: Scratchpad for notes while creating tasks
- **Guideline Buttons**: Quick links to project guidelines
- **Remove Textarea Gradient**: Cleaner textarea appearance
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen

### Computer Use Task Revision Page
- **Prompt Scratchpad**: Scratchpad for notes while revising
- **Guideline Buttons**: Quick links to guidelines
- **Remove Textarea Gradient**: Cleaner textarea appearance
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering

### QA Tool Use Review Page
- **Clear Search**: One-click clear for search inputs
- **Favorites**: Star frequently-used tools (persists between sessions)
- **Execute to Current Tool**: Execute all tools from the start up to and including the current tool
- **Workflow Cache**: Cache workflow state for faster reloads and recovery
- **Copy Prompt**: Copy prompt text to clipboard
- **Copy Verifier Output**: Copy verifier output to clipboard
- **QA Scratchpad**: Adjustable-height scratchpad for notes between prompt quality rating and environment variables (with option to remember contents)
- **JSON Editor Online**: Button that links to JSON Editor Online for JSON manipulation
- **Guideline Buttons**: Quick links to guidelines below the QA scratchpad
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Panel Size Memory**: Remembers your preferred panel sizes between sessions
- **Remember Layout Proportions**: Persists and restores panel split positions between sessions
- **Request Revisions Improvements**: Enhanced workflow with auto-copy workflow to "What did you try?", auto-paste prompt to Task issue, and auto-paste verifier output to Grading issue (with guideline link shortcuts)
- **Prompt Diff Highlighting**: Highlight differences in prompt content when comparing versions
- **Toggle Tool Parameters**: Collapse/expand tool parameters (with option to auto-collapse on execute)
- **Tool Results Resize Handle**: Resizable tool results area
- **Tool description truncation**: Truncate long tool descriptions (with option to hide when collapsed)
- **Text Sanitizer**: Sanitize and normalize text in workflow-related fields

### QA Computer Use Review Page
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Copy Prompt**: Copy prompt text to clipboard
- **Copy Verifier Output**: Copy verifier output to clipboard
- **Guideline Buttons**: Quick links to guidelines
- **Request Revisions Improvements**: Enhanced workflow with auto-copy workflow to "What did you try?", auto-paste prompt to Task issue, and auto-paste verifier output to Grading issue
- **QA Scratchpad**: Adjustable-height scratchpad for notes (with option to remember contents)
- **Prompt Diff Highlighting**: Highlight differences in prompt content when comparing versions

---

## Configuration

Click the Tampermonkey icon and select "Fleet Workflow Builder UX Enhancer" to access the settings panel. From there you can:

- Enable or disable individual features
- Configure feature-specific options
- View debug logs (dev builds only)

---

## Updating

**Automatic Updates**: Tampermonkey will automatically check for updates and notify you when a new version is available.

**Manual Update**: Click the Tampermonkey icon → Dashboard → select the script → click "Check for updates"

---

## Troubleshooting

**Script not loading:**
- Ensure Tampermonkey is installed and enabled
- Check that the script is enabled in Tampermonkey's dashboard
- Verify the URL matches `https://fleetai.com/*`
- Try refreshing the page

**Features not appearing:**
- Some features only load on specific pages
- Check the Settings UI to ensure the feature is enabled
- Open browser DevTools (F12) and check the console for error messages

**Permission errors:**
- Grant cross-origin request permissions when Tampermonkey prompts
- In Tampermonkey settings, ensure "Allow requests to `raw.githubusercontent.com`" is permitted

---

## Development

This script uses a modular plugin architecture. Plugins are organized by archetype; each archetype has a folder under `plugins/archetypes/` with `main/`, and optionally `dev/` or `deprecated/` subfolders. Core behavior (settings UI, dev-only logger panel) lives under `plugins/core/`.

```
plugins/
├── core/
│   ├── main/                 # Settings UI (all builds)
│   └── dev/                  # Logger panel (dev builds only)
└── archetypes/
    ├── dashboard/            # Main dashboard (work/create)
    ├── qa-project-picker/     # QA project picker (work/problems/qa)
    ├── tool-use-task-creation/
    ├── tool-use-revision/
    ├── comp-use-task-creation/
    ├── comp-use-revision/
    ├── qa-tool-use/           # QA tool use review
    └── qa-comp-use/           # QA computer use review
```

Plugin load lists (core, dev, and per-archetype) and versions are defined in `archetypes.json`. Run `./utils/update-archetypes.js` or `./utils/update-versions.py` when plugin versions or archetypes change.
