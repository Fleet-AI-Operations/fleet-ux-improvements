// ============= notes-resize-handle.js (library) =============
// Shared logic: enable native vertical resizing on the "Notes for QA Reviewer" textarea.

const NotesResizeHandleApi = {
    run(state, options) {
        const logTag = (options && options.logTag) || 'notesResizeHandle';
        const notesTextarea = this.findNotesTextarea(logTag);
        if (!notesTextarea) {
            if (!state.missingLogged) {
                Logger.debug(logTag + ': QA notes textarea not found yet');
                state.missingLogged = true;
            }
            return;
        }

        if (notesTextarea.dataset.wfNotesResizeApplied === '1') return;

        notesTextarea.style.resize = 'vertical';
        notesTextarea.style.overflowY = 'auto';
        notesTextarea.style.minHeight = notesTextarea.style.minHeight || '60px';
        notesTextarea.dataset.wfNotesResizeApplied = '1';

        state.missingLogged = false;
        Logger.log(logTag + ': DOM ready — enabled vertical resize on QA notes textarea');
    },

    findNotesTextarea(logTag) {
        const tag = logTag || 'notesResizeHandle';
        const byPlaceholder = Context.dom.query(
            'textarea[placeholder*="help the QA reviewer understand your task"]',
            { context: tag + '.notesByPlaceholder' }
        );
        if (byPlaceholder) return byPlaceholder;

        const labels = Context.dom.queryAll('label', { context: tag + '.labels' });
        for (const label of labels) {
            const text = (label.textContent || '').toLowerCase();
            if (!text.includes('notes for qa reviewer')) continue;

            const container = label.closest('div');
            if (!container) continue;

            const textarea = container.querySelector('textarea');
            if (textarea) return textarea;
        }

        return null;
    }
};

const plugin = {
    id: 'notesResizeHandleLib',
    name: 'Notes Resize Handle (library)',
    description: 'Shared API for enabling vertical resize on the QA reviewer notes textarea',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.notesResizeHandle = {
            run: (s, options) => NotesResizeHandleApi.run(s, options),
            findNotesTextarea: (logTag) => NotesResizeHandleApi.findNotesTextarea(logTag)
        };
        if (!state.registered) {
            Logger.log('notesResizeHandleLib: module registered (Context.notesResizeHandle)');
            state.registered = true;
        }
    }
};
