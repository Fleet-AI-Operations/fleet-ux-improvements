
// ============= hide-testing-environment-banner.js =============
const plugin = {
    id: 'hideTestingEnvironmentBanner',
    name: 'Hide Testing Environment Banner',
    description: 'Hides the "You are currently testing the environment" banner that can block the embedded work area',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { hidden: false, missingLogged: false },

    onMutation(state, context) {
        if (state.hidden) return;

        // Find the banner by its unique text content (avoids fragile class-order selectors)
        const spans = document.querySelectorAll('span');
        const bannerSpan = Array.from(spans).find(
            (s) =>
                s.textContent &&
                (s.textContent.includes('You are currently testing the environment') ||
                    s.textContent.includes('Start recording to create a demonstration'))
        );
        if (!bannerSpan) {
            if (!state.missingLogged) {
                Logger.debug('Testing environment banner span not found');
                state.missingLogged = true;
            }
            return;
        }

        // Walk up to the banner wrapper: div with absolute, z-10, pointer-events-none
        let el = bannerSpan.parentElement;
        while (el) {
            if (
                el.classList &&
                el.classList.contains('absolute') &&
                el.classList.contains('z-10') &&
                el.classList.contains('pointer-events-none')
            ) {
                el.style.display = 'none';
                state.hidden = true;
                Logger.log('✓ Testing environment banner hidden');
                return;
            }
            el = el.parentElement;
        }

        if (!state.missingLogged) {
            Logger.warn('Testing environment banner wrapper not found');
            state.missingLogged = true;
        }
    }
};
