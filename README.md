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
- [Install Fleet UX Enhancer](https://raw.githubusercontent.com/fleet-ai-operations/fleet-ux-improvements/main/fleet.user.js)

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

The extension uses an archetype-based plugin system that loads different features depending on which page you're on. Plugin configuration and versions are managed in `archetypes.json`. The lists below match plugins shipped from each archetype’s `main` folder in the production archetype set (not `dev` or `deprecated`).

Many of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!

### Main Dashboard
- **Disputes Reviewed Today Breakdown**: Show today's disputes reviewed count and approved/rejected breakdown with copy and scroll warning
- **Feedback Given Stats**: Show overall approval rate, today's feedback count and environment breakdown with day and per-env approval rates, plus copy and scroll warning
- **Daily Task Creation Breakdown**: Show today's task creation count and environment breakdown under the Task Creation stat, with a warning when list may be incomplete

### Tool Use Task Creation Page
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Workflow Cache**: Adds the ability to restore the previous workflow when it has been cleared or the page has been reloaded

### Tool Use Task Creation Page (OpenClaw / Special Projects)
*Loads when the task-creation page matches the OpenClaw / Special Projects disambiguator in `archetypes.json`.*
- **Bug Report Readability Fix**: Makes bug report cards expandable to see full text
- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Tool Favorites**: Add favorite stars to tools list
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **JSON Editor Online**: Add button that opens JSON Editor Online in a new tab. Optionally show button on each tool result to copy output and open editor.
- **Remember Layout Proportions**: Persist and restore the main panel split positions on Tool Use Task Creation pages
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Text Sanitizer**: Adds a text sanitizer utility for quickly cleaning and transforming text
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Workflow Cache**: Adds the ability to restore the previous workflow when it has been cleared or the page has been reloaded

### Tool Use Task Revision Page
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging

### Computer Use Task Creation Page
- **Disable Prompt Text Area Autocorrect**: Disables autocorrect in the prompt text box
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **Remember Layout Proportions**: Persist and restore the main pane split (task detail vs instance) on comp-use QA pages
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea

### Computer Use Task Revision Page
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Remember Layout Proportions**: Persist and restore the main pane split (task detail vs instance) on comp-use QA pages
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea

### QA Tool Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Prompt**: Add a copy button next to the Prompt label. Click copies the prompt text to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **Hide Grading Panel Button**: Adds Hide Grading in the Grading panel header; delegates to the top Hide Grading control when grading is open.
- **"Request Revisions" Modal Improvements**: Improvements to the Request Revisions Workflow
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Useful Link Buttons**: Add useful link buttons to the page

### QA Computer Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Result Params and Inputs**: Add a button under Your Answer that copies all parameter labels and values to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Corner Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; button in the top bar
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **Hide Grading Panel Button**: Adds Hide Grading in the Grading panel header; delegates to the top Hide Grading control when grading is open.
- **Remember Layout Proportions**: Persist and restore the main pane split (task detail vs instance) on comp-use QA pages
- **Request Revisions Improvements**: Improvements to the Request Revisions Workflow

### Dispute Detail Page
- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Create Instance Autoclick**: Automatically clicks the "Create Instance" button once when it becomes visible.
- **Dispute Resolution Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; control in the top bar
- **Dispute Screenshot Upload Improvement**: Drag & Drop/Upload plus Paste Image (clipboard API) in one row; document paste; forwards images to the hidden native file input without duplicate controls after thumbnails appear
- **Dispute Tool Environment Gate**: Detects tool environment readiness for dispute detail pages
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Tool Favorites**: Add favorite stars to tools list
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Description Truncation**: Limits the length tool descriptions to make the tool picker more manageable
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging

### Session Trace Review Page
- **Session Trace Show/Hide Widgets**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; control in the top bar before Skip
- **Remember Layout Proportions**: Save and restore panel split percentages (main columns, prompt vs comments in the left stack, transcript vs screenshot in the trace area)
- **Auto-expand Verifier Output**: Expands the Verifier Output section on load by activating the score/timing header once (same as a user click)

### Task View
*No production plugins are configured for this archetype.*

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