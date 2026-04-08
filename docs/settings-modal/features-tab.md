1.11

## Features

The extension uses an archetype-based plugin system that loads different features depending on which page you're on. Plugin configuration and versions are managed in `archetypes.json`. The lists below match plugins shipped from each archetype’s `main` folder in the production archetype set (not `dev` or `deprecated`).

Many of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!

### Main Dashboard
- **Disputes Reviewed Today Breakdown**: Show today's disputes reviewed count and approved/rejected breakdown with copy and scroll warning
- **Feedback Given Stats**: Show overall approval rate, today's feedback count and environment breakdown with day and per-env approval rates, plus copy and scroll warning
- **Daily Task Creation Breakdown**: Show today's task creation count and environment breakdown under the Task Creation stat, with a warning when list may be incomplete

### Tool Use Task Creation Page
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Guideline Buttons**: Add links to the guidelines on the page
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
- **Guideline Buttons**: Add links to the guidelines on the page
- **JSON Editor Online**: Add button that opens JSON Editor Online in a new tab. Optionally show button on each tool result to copy output and open editor.
- **Remember Layout Proportions**: Persist and restore the main panel split positions on Tool Use Task Creation pages
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea
- **Text Sanitizer**: Adds a text sanitizer utility for quickly cleaning and transforming text
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Workflow Cache**: Adds the ability to restore the previous workflow when it has been cleared or the page has been reloaded

### Tool Use Task Revision Page
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Guideline Buttons**: Add links to the guidelines on the page
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging

### Computer Use Task Creation Page
- **Disable Prompt Text Area Autocorrect**: Disables autocorrect in the prompt text box
- **Guideline Buttons**: Add links to the guidelines on the page
- **Scratchpad**: Adds an adjustable height scratchpad to the page
- **Remember Layout Proportions**: Persist and restore the main pane split (task detail vs instance) on comp-use QA pages
- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea

### Computer Use Task Revision Page
- **Guideline Buttons**: Add links to the guidelines on the page
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
- **QA Scratchpad**: Adds an adjustable height scratchpad to the page
- **"Request Revisions" Modal Improvements**: Improvements to the Request Revisions Workflow
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging
- **Useful Link Buttons**: Add useful link buttons to the page

### QA Computer Use Review Page
- **"Accept Task" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb
- **Auto Start Recording**: Automatically clicks the "Start Recording" button once when it appears on the page.
- **Copy Result Params and Inputs**: Add a button under Your Answer that copies all parameter labels and values to the clipboard
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Guideline Buttons**: Add links to the guidelines on the page
- **Hide Grading Autoclick**: Automatically clicks the "Hide Grading" button once when it becomes available after load.
- **Hide Grading Panel Button**: Adds Hide Grading in the Grading panel header; delegates to the top Hide Grading control when grading is open.
- **QA Scratchpad**: Adds an adjustable height scratchpad to the page
- **Remember Layout Proportions**: Persist and restore the main pane split (task detail vs instance) on comp-use QA pages
- **Request Revisions Improvements**: Improvements to the Request Revisions Workflow

### Dispute Detail Page
- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text
- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text
- **Create Instance Autoclick**: Automatically clicks the "Create Instance" button once when it becomes visible.
- **Dispute Resolution Action Menu**: Keeps Flag as Bug as a full-width button above a full-width action dropdown and Confirm; other actions trigger hidden native buttons
- **Dispute Detail Task ID**: Shows a copyable Task ID in the dispute detail header from the View Task link
- **Dispute Resolution Widgets Toggle**: Toggle visibility (CSS only) of bottom-right Pylon chat and Report a bug FAB; control in the top bar
- **Dispute Tool Environment Gate**: Detects tool environment readiness for dispute detail pages
- **Execute to Current Tool**: Adds button to execute all tools from the beginning up to and including the current tool
- **Tool Favorites**: Add favorite stars to tools list
- **Toggle Tool Parameters**: Adds a toggle to each tool header to hide/show its parameters section
- **Tool Description Truncation**: Limits the length tool descriptions to make the tool picker more manageable
- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging

### Task View
*No production plugins are configured for this archetype.*
