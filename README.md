# Fleet Safe UX Build

Local containment userscript for Fleet problem creation and review. It keeps FOS clipboard/autoconnect, local UX helpers, and QA shortcuts. Ops Dashboard, OpenRouter, verifier-source lookup, team/permission tools, token capture, and remote plugin loading are off.

This checkout is intended for **local Tampermonkey install only**. After editing allowlisted plugins, rebuild with `node dev/utils/build-safe-ux.mjs`.

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

### Step 3: Install the Local Script

1. Run `node dev/utils/build-safe-ux.mjs` from the repo root if `fleet.user.js` has not been bundled yet
2. Open Tampermonkey in your browser and go to the **Dashboard**
3. Click the **+** tab (or "Create a new script")
4. Delete any template code
5. Copy the contents of `fleet.user.js` and paste it into the editor
6. Press `Ctrl+S` (or `Cmd+S` on Mac) to save
7. Disable any older Fleet UX Enhancer script so only this Safe UX Build runs

### Step 4: Confirm the script is enabled

This Safe UX Build does not fetch plugins from GitHub and does not need cross-origin GitHub/jsDelivr/OpenRouter permissions.

If the script doesn't seem to be working:
1. Click the Tampermonkey icon in your browser toolbar
2. Ensure the script is **enabled** (toggle should be on)
3. Check that the script is allowed to run on `https://fleetai.com/*`
4. Refresh the page

---

## Features

This build loads only compile-time allowlisted modules bundled into `fleet.user.js`. Changing `archetypes.json` alone cannot activate a new remote module.

**Kept:** FOS iframe autoconnect and VM clipboard Extract/Overwrite; prompt counters, scratchpads, sanitizer, resize handles, user-story markdown/collapse, panel toggles; QA auto-start recording (toggleable), copy buttons, Request Revisions helpers, accept-task modal helpers, hide/show verifier output.

**Suspended:** Ops Dashboard, worker search, ratings, team/permission tools, OpenRouter/AI, verifier-source lookup, source-data explorer, dashboard stats, remote plugin fetching, and session-token capture.

The extension still uses an archetype-based plugin system. The lists below may mention older production features that are **not** loaded in this containment build.

Many of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!

### Main Dashboard
- **Disputes Reviewed Today Breakdown**: Show today's disputes reviewed count and approved/rejected breakdown with copy and scroll warning

### Tool Use Task Creation Page
- **Explore GUI**: Opens the underlying tool environment in a new tab (captures env root from `/api/mcp-proxy` subdomain, with legacy `/mcp` fallback; acknowledgment modal before opening)
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Text Sanitizer**: Adds a text sanitizer utility for quickly cleaning and transforming text
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### Tool Use Task Creation Page (OpenClaw / Special Projects)
*Loads when the task-creation page matches the OpenClaw / Special Projects disambiguator in `archetypes.json`.*
- **Bug Report Readability Fix**: Makes bug report cards expandable to see full text
- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text
- **Tool Favorites**: Add favorite stars to tools list
- **JSON Editor Online**: Add button that opens JSON Editor Online in a new tab. Optionally show button on each tool result to copy output and open editor.
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Text Sanitizer**: Adds a text sanitizer utility for quickly cleaning and transforming text
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### Tool Use Task Revision Page
- **Explore GUI**: Opens the underlying tool environment in a new tab (captures env root from `/api/mcp-proxy` subdomain, with legacy `/mcp` fallback; acknowledgment modal before opening)
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### Computer Use Task Creation Page
- **Disable Prompt Text Area Autocorrect**: Disables autocorrect in the prompt text box
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **Creation Annotator Instructions**: Shows annotator instructions above the user story on computer-use creation
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Time Remaining Chip**: Keeps the Time remaining countdown from shifting the header as digits change
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

### Computer Use Task Revision Page
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

### QA Tool Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Prompt**: Add a copy button next to the Prompt label. Click copies the prompt text to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **Hide Verifier Output**: Adds Hide/Show Verifier before Run Verifier; hides the output body and collapses the bottom panel until shown or a verifier run starts
- **Workflow Verifier Tab**: Adds Workflow | Verifier tabs on the QA workflow panel and shows searchable verifier source for the current task
- **"Request Revisions" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Useful Link Buttons**: Add useful link buttons to the page
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### QA Computer Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Result Params and Inputs**: Add a button under Your Answer that copies all parameter labels and values to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **"Request Revisions" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions
- **User Story Collapse**: Adds Hide/Show on the User Story row to collapse the story body below the label
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls beside the Verifier tab (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

### Dispute Review Page
- **Dispute List Collapse**: Hijacks the native expand control for a full collapse that hides everything except the status/time/#id header row; remembers closed dispute numbers across reloads
- **Dispute List Filters**: Environment checkbox dropdown (with per-environment counts; nothing selected = all) and a Sort by Date (Descending/Ascending) toggle on the same toolbar row as native search; Clear resets environment filters; non-matching cards are hidden in place

### Dispute Detail Page
- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Dispute Screenshot Upload Improvement**: Drag & Drop/Upload plus Paste Image (clipboard API) in one row; document paste; forwards images to the hidden native file input without duplicate controls after thumbnails appear
- **Dispute Tool Environment Gate**: Detects tool environment readiness for dispute detail pages
- **Environment Verifier Tab**: Adds Environment | Verifier tabs on the instance status bar (beside Start Recording / Reset / Run Verifier) and shows searchable verifier source; switches only the iframe stack
- **Tool Favorites**: Add favorite stars to tools list
- **Tool Description Truncation**: Limits the length tool descriptions to make the tool picker more manageable
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Verifier Expand Mismatch Rows**: Expands Per-Field Comparison rows that failed (red X) so Expected vs Your Answer is visible without clicking each field
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls after the Computer Use badge (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again

### Session Trace Review Page
- **Auto-expand Verifier Output**: Expands the Verifier Output section on load by activating the score/timing header once (same as a user click)
- **Remember Layout Proportions**: Saves and restores the task-stack vs trace, prompt vs comments, and transcript vs screenshot splits

### Guidelines
- **Export Guideline Markdown**: Download the open guideline as a Markdown file from the edit toolbar
- **Guideline Theme Presets**: Apply named text themes from the edit toolbar

### Task View
*No production plugins are configured for this archetype.*

---

## Configuration

Click the Tampermonkey icon and select "Fleet UX Enhancer" to access the settings panel. From there you can:

- Choose Preferred Visual Mode (match site, light, or dark) for extension chrome
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