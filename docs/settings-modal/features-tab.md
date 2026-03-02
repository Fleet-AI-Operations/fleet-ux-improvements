1.7

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

### Task Creation Environment Picker Page
- **Sort Environments Alphabetically**: Sort environment cards A–Z by name within each project section

### Computer Use Task Creation Page
- **Auto Toggle Fullscreen Mode**: Clicks the fullscreen toggle on load to enter fullscreen
- **Prompt Scratchpad**: Scratchpad for notes while creating tasks
- **Guideline Buttons**: Quick links to project guidelines
- **Remove Textarea Gradient**: Cleaner textarea appearance
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen
- **Remember Layout Proportions**: Persist and restore panel split positions between sessions

### Computer Use Task Revision Page
- **Auto Toggle Fullscreen Mode**: Clicks the fullscreen toggle on load to enter fullscreen
- **Prompt Scratchpad**: Scratchpad for notes while revising
- **Guideline Buttons**: Quick links to guidelines
- **Remove Textarea Gradient**: Cleaner textarea appearance
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Remember Layout Proportions**: Persist and restore panel split positions between sessions

### QA Tool Use Review Page
- **Clear Search**: One-click clear for search inputs
- **Favorites**: Star frequently-used tools (persists between sessions)
- **Execute to Current Tool**: Execute all tools from the start up to and including the current tool
- **Workflow Cache**: Cache workflow state for faster reloads and recovery
- **Copy Prompt**: Copy prompt text to clipboard
- **Copy Verifier Output**: Copy verifier output to clipboard
- **QA Scratchpad**: Adjustable-height scratchpad for notes between prompt quality rating and environment variables (with option to remember contents)
- **Useful Link Buttons**: Quick links to QA/Kinesis guidelines and JSON Editor Online below the scratchpad
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Remember Layout Proportions**: Persists and restores panel split positions between sessions
- **Request Revisions Improvements**: Enhanced workflow with auto-copy workflow to "What did you try?", auto-paste prompt to Task issue, and auto-paste verifier output to Grading issue (with guideline link shortcuts)
- **Prompt Diff Highlighting**: Highlight differences in prompt content when comparing versions
- **Toggle Tool Parameters**: Collapse/expand tool parameters (with option to auto-collapse on execute)
- **Tool Results Resize Handle**: Resizable tool results area
- **Tool description truncation**: Truncate long tool descriptions (with option to hide when collapsed)
- **Text Sanitizer**: Sanitize and normalize text in workflow-related fields

### QA Computer Use Review Page
- **Auto Toggle Fullscreen Mode**: Clicks the fullscreen toggle on load to enter fullscreen
- **Hide Testing Environment Banner**: Hides the testing environment notice that blocks the top portion of the screen
- **Bug Report Expand**: Click bug reports to expand and view full content with proper whitespace rendering
- **Copy Prompt**: Copy prompt text to clipboard
- **Copy Verifier Output**: Copy verifier output to clipboard
- **Copy Result Params and Inputs**: Button under Your Answer to copy parameter labels and values to clipboard
- **Guideline Buttons**: Quick links to guidelines
- **Request Revisions Improvements**: Enhanced workflow with auto-copy workflow to "What did you try?", auto-paste prompt to Task issue, and auto-paste verifier output to Grading issue
- **QA Scratchpad**: Adjustable-height scratchpad for notes (with option to remember contents)
- **Prompt Diff Highlighting**: Highlight differences in prompt content when comparing versions
- **Metadata Tag QA Enhancements**: Show/hide Writer Metadata section; suggested tag changes as toggles with "Copy Suggested Changes" for feedback
- **Accept Task Modal Improvements**: Button above optional comments to paste a positive blurb when accepting a task
- **Remember Layout Proportions**: Persist and restore panel split positions between sessions

### Dispute Review Page
- **Dispute IDs Enhancer**: Surface Dispute and Task IDs at the top of each dispute card, with an optional ignore mode that lets you mark disputes as ignored by ID, collapse all inner content, and restore your saved "Your Resolution" text when you revisit the page.