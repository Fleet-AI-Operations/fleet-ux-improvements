// ============= remove-textarea-gradient.js =============
const plugin = {
    id: 'removeTextareaGradient',
    name: 'Remove Textarea Gradient',
    description: 'Removes the gradient fade overlay from the prompt textarea',
    _version: '2.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        promptRemoved: false,
        scratchpadRemoved: false,
        missingLogged: false,
        overlayMissingLogged: false,
        scratchpadMissingLogged: false,
        scratchpadOverlayMissingLogged: false
    },

    clearGradient(el) {
        if (!el) return false;
        el.style.background = 'none';
        el.style.pointerEvents = 'none';
        return true;
    },

    findGradientInContainer(container) {
        if (!container) return null;
        return Array.from(container.children).find(el =>
            el.tagName === 'DIV' &&
            el.classList.contains('bg-gradient-to-b') &&
            el.classList.contains('absolute') &&
            el.classList.contains('pointer-events-none')
        ) || Context.dom.query('div.bg-gradient-to-b.absolute.pointer-events-none', {
            root: container,
            context: `${this.id}.gradientOverlay`
        });
    },

    onMutation(state, context) {
        if (state.promptRemoved && state.scratchpadRemoved) return;

        // --- Prompt textarea gradient ---
        if (!state.promptRemoved) {
            const textarea = Context.dom.query('#prompt-editor', {
                context: `${this.id}.promptTextarea`
            });
            if (!textarea) {
                if (!state.missingLogged) {
                    Logger.debug('Prompt textarea not found for gradient removal');
                    state.missingLogged = true;
                }
            } else {
                const container = textarea.parentElement;
                if (!container && !state.missingLogged) {
                    Logger.debug('Textarea container not found for gradient removal');
                    state.missingLogged = true;
                } else if (container) {
                    const gradientOverlay = this.findGradientInContainer(container);
                    if (gradientOverlay && this.clearGradient(gradientOverlay)) {
                        state.promptRemoved = true;
                        Logger.log('✓ Prompt textarea gradient fade removed');
                    } else if (!state.overlayMissingLogged) {
                        Logger.debug('Gradient overlay not found in prompt textarea');
                        state.overlayMissingLogged = true;
                    }
                }
            }
        }

        // --- Scratchpad gradient ---
        if (!state.scratchpadRemoved) {
            const scratchpadLabel = Array.from(document.querySelectorAll('label')).find(l =>
                l.textContent.trim().startsWith('Scratchpad')
            );
            if (!scratchpadLabel) {
                if (!state.scratchpadMissingLogged) {
                    Logger.debug('Scratchpad label not found for gradient removal');
                    state.scratchpadMissingLogged = true;
                }
            } else {
                const section = scratchpadLabel.closest('div');
                const gradientOverlay = section
                    ? section.querySelector('div.bg-gradient-to-b.absolute.pointer-events-none')
                    : null;
                if (gradientOverlay && this.clearGradient(gradientOverlay)) {
                    state.scratchpadRemoved = true;
                    Logger.log('✓ Scratchpad gradient fade removed');
                } else if (!state.scratchpadOverlayMissingLogged) {
                    Logger.debug('Gradient overlay not found in scratchpad');
                    state.scratchpadOverlayMissingLogged = true;
                }
            }
        }
    }
};
