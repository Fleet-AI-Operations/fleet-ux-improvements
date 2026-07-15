// ============= notes-resize-handle.js =============
// Thin wrapper: shared Context.notesResizeHandle library.

const plugin = {
    id: 'notesResizeHandle',
    name: 'Notes Resize Handle',
    description: 'Adds a vertical resize handle to the QA reviewer notes textarea',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state) {
        const api = Context.notesResizeHandle;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id });
    }
};
