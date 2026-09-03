1.46

## Fleet Safe UX Build
This containment build ships only the allowlisted helpers below. Ops Dashboard, Search Chat, Diff Viewer, OpenRouter, verifier-source lookup, dashboard stats, dispute filters, and remote module loading are suspended.

## Features

The extension uses an archetype-based plugin system that loads different features depending on which page you're on. Plugin configuration and versions are managed in `archetypes.json`. The lists below match plugins shipped from each archetype’s `main` folder in the production archetype set (not `dev` or `deprecated`).

Many of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!

### Main Dashboard
- **Disputes Reviewed Today Breakdown**: Show today's disputes reviewed count and approved/rejected breakdown with copy and scroll warning

### Tool Use Task Creation Page
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
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
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### Tool Use Task Revision Page
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### Computer Use Task Creation Page
- **Disable Prompt Text Area Autocorrect**: Disables autocorrect in the prompt text box
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **Action Counter**: Persistent +/- counter in the page header
- **Creation Annotator Instructions**: Shows annotator instructions above the user story on computer-use creation
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Time Remaining Chip**: Keeps the Time remaining countdown from shifting the header as digits change
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

### Computer Use Task Revision Page
- **Prompt Text Counter**: Shows a live word and character count below the prompt
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **Action Counter**: Persistent +/- counter in the page header
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

### QA Tool Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Prompt**: Add a copy button next to the Prompt label. Click copies the prompt text to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **"Request Revisions" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Useful Link Buttons**: Add useful link buttons to the page
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas

### QA Computer Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Result Params and Inputs**: Add a button under Your Answer that copies all parameter labels and values to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **"Request Revisions" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions
- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas
- **Action Counter**: Persistent +/- counter beside the Verifier tab
- **VM Clipboard**: Extract/Overwrite VM Clipboard controls beside the Verifier tab (shown when FOS env is ready)
- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again
- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width

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

### noVNC Instance (FOS opened directly in a tab)
- **External VNC Helper**: Floating panel on directly-opened noVNC sessions with a clipboard bridge (Extract/Overwrite between your OS clipboard and the VM), prompt cache, and scratchpad; keyboard shortcuts keep working with the panel hidden
- **External Env Helper**: Floating prompt cache + scratchpad panel for non-VNC external env pages

### Task View
*No production plugins are configured for this archetype.*
