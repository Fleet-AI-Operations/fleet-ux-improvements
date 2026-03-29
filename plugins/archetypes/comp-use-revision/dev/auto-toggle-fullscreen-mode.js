
// ============= auto-toggle-fullscreen-mode.js =============
const plugin = {
    id: 'autoToggleFullscreenMode',
    name: 'Auto Toggle Fullscreen Mode',
    description: 'Clicks the fullscreen (monitor) toggle button once when the page loads to enter fullscreen mode',
    _version: '1.2',
    enabledByDefault: false,
    phase: 'mutation',
    initialState: { clicked: false, missingLogged: false, envChecked: false, fosEnvExempt: false },

    onMutation(state, context) {
        if (state.clicked) return;
        if (state.fosEnvExempt) return;

        // One-time check: skip activation when Env is fos-* (e.g. fos-operations)
        if (!state.envChecked) {
            state.envChecked = true;
            const envLabel = Array.from(document.querySelectorAll('span.text-muted-foreground')).find(s => s.textContent.trim() === 'Env:');
            if (envLabel) {
                const envValue = envLabel.nextElementSibling?.textContent?.trim() || '';
                if (envValue.startsWith('fos-')) {
                    state.fosEnvExempt = true;
                    state.clicked = true;
                    Logger.log('Auto Toggle Fullscreen: skipped (fos-* env: ' + envValue + ')');
                    return;
                }
            }
        }

        // Fullscreen toggle: button containing SVG path for monitor icon (M2 7C2 5.34315...)
        const path = document.querySelector('svg path[d*="M2 7C2 5.34315"]');
        if (!path) {
            if (!state.missingLogged) {
                Logger.debug('Auto Toggle Fullscreen: fullscreen button not found');
                state.missingLogged = true;
            }
            return;
        }

        const button = path.closest('button');
        if (!button) {
            if (!state.missingLogged) {
                Logger.warn('Auto Toggle Fullscreen: fullscreen path found but no parent button');
                state.missingLogged = true;
            }
            return;
        }

        button.click();
        state.clicked = true;
        Logger.log('Auto Toggle Fullscreen: fullscreen toggle clicked');
    }
};
