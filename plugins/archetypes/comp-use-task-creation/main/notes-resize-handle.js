// ============= notes-resize-handle.js =============
// Enables native vertical resizing on the "Notes for QA Reviewer" textarea.

const plugin = {
    id: 'notesResizeHandle',
    name: 'Notes Resize Handle',
    description: 'Adds a vertical resize handle to the QA reviewer notes textarea',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state) {
        const notesTextarea = this.findNotesTextarea();
        if (!notesTextarea) {
            if (!state.missingLogged) {
                Logger.debug('QA notes textarea not found for resize handle');
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
        Logger.log('✓ Enabled resize handle for QA notes textarea');
    },

    findNotesTextarea() {
        const byPlaceholder = Context.dom.query(
            'textarea[placeholder*="help the QA reviewer understand your task"]',
            { context: `${this.id}.notesByPlaceholder` }
        );
        if (byPlaceholder) return byPlaceholder;

        const labels = Context.dom.queryAll('label', { context: `${this.id}.labels` });
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

