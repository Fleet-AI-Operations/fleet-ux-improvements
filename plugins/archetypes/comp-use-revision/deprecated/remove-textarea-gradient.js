
// ============= remove-textarea-gradient.js =============
const plugin = {
    id: 'removeTextareaGradient',
    name: 'Remove Textarea Gradient',
    description: 'Removes the gradient fade overlay from the prompt textarea',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { removed: false, missingLogged: false, overlayMissingLogged: false },
    
    onMutation(state, context) {
        if (state.removed) return;

        // Start from stable textarea ID (semantic approach)
        const textarea = Context.dom.query('#prompt-editor', {
            context: `${this.id}.promptTextarea`
        });
        if (!textarea) {
            if (!state.missingLogged) {
                Logger.debug('Prompt textarea not found for gradient removal');
                state.missingLogged = true;
            }
            return;
        }

        // Navigate to parent container
        const container = textarea.parentElement;
        if (!container) {
            if (!state.missingLogged) {
                Logger.debug('Textarea container not found for gradient removal');
                state.missingLogged = true;
            }
            return;
        }

        // Find gradient overlay semantically: absolutely positioned div with gradient class
        // that is a sibling of the textarea (or child of same container)
        const gradientOverlay = Array.from(container.children).find(el => 
            el.tagName === 'DIV' &&
            el.classList.contains('bg-gradient-to-b') &&
            el.classList.contains('absolute') &&
            el.classList.contains('pointer-events-none')
        ) || Context.dom.query('div.bg-gradient-to-b.absolute.pointer-events-none', {
            root: container,
            context: `${this.id}.gradientOverlay`
        });

        if (gradientOverlay) {
            gradientOverlay.style.background = 'none';
            gradientOverlay.style.pointerEvents = 'none';
            state.removed = true;
            Logger.log('✓ Textarea gradient fade removed');
        } else if (!state.overlayMissingLogged) {
            Logger.debug('Gradient overlay not found in prompt textarea');
            state.overlayMissingLogged = true;
        }
    }
};

