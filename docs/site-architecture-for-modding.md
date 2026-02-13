## What Would Help The Plugin Work Better on the Site

### Stable, semantic hooks instead of layout or copy

The plugin currently relies on fragile signals: Tailwind-style class names and DOM structure (e.g. `div.rounded-lg.border`, `.flex-1.px-16.py-4.max-w-screen-md.mx-auto`), patterns like `id^="radix-"` and `label[for^="param-"]`, and visible text or placeholders (“Execute”, “Save”, “QA Review - Select Environment”, `placeholder="Search tools, descriptions, parameters..."`). Any design, layout, or copy change on the site can break those.

**What would help:** Use **stable `data-*` attributes** (and, where appropriate, **stable IDs**) for key regions, components, and controls—and avoid tying structure to copy or placeholders. Prefer **`data-ui`**, **`aria-label`**, or **`data-action`** so automation can find elements without depending on button text or placeholder. Examples:

- `data-ui="workflow-panel"`, `data-ui="tool-card"`, `data-ui="tool-header"`
- `data-ui="tool-search-input"`, `data-ui="tool-list"`, `data-ui="workflow-toolbar"`
- For controls: stable `id` or `data-ui` on the “tools” container, “workflow” panel, execute button (e.g. `data-ui="execute-tool"`), parameter blocks, comboboxes (e.g. `data-control="execute-tool"`, `data-param="..."`).

Then the plugin could use e.g. `[data-ui="tool-card"]` instead of long Tailwind chains or text scans, and the plugin’s “find workflow panel” / “find stable parent” logic could be simpler and more reliable. Design and copy changes would not force selector updates.
reliable behavior as the site’s design and copy evolve.