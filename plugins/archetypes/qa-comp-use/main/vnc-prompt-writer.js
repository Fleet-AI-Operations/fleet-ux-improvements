// ============= vnc-prompt-writer.js =============
// Archetype: qa-comp-use. Saves the task prompt to localStorage so the no-vnc VNC Helper
// modal can pre-fill its Prompt section (2-hour TTL, read by vnc-helper.js).

const PROMPT_STORAGE_KEY = 'fleet-vnc-helper-prompt';
const PROMPT_TS_STORAGE_KEY = 'fleet-vnc-helper-prompt-ts';

const plugin = {
    id: 'vncPromptWriter',
    name: 'VNC Prompt Writer',
    description: 'Caches the QA task prompt for the VNC Helper modal on noVNC pages',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        savedLogged: false,
        missingLogged: false,
        lastSavedText: null
    },

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    getPromptTextFromSection(promptSection) {
        const textarea = promptSection.querySelector('textarea');
        if (textarea && textarea.value !== undefined) {
            return textarea.value.trim();
        }
        const preWrap = promptSection.querySelector('div.text-sm.whitespace-pre-wrap');
        if (preWrap) {
            return preWrap.textContent.trim();
        }
        return null;
    },

    savePrompt(text, state) {
        if (state.lastSavedText === text) {
            return;
        }
        try {
            localStorage.setItem(PROMPT_STORAGE_KEY, text);
            localStorage.setItem(PROMPT_TS_STORAGE_KEY, String(Date.now()));
            state.lastSavedText = text;
            if (!state.savedLogged) {
                Logger.log(`vncPromptWriter: cached prompt for VNC Helper (${text.length} chars)`);
                state.savedLogged = true;
            }
        } catch (e) {
            Logger.warn('vncPromptWriter: failed to write prompt to localStorage', e);
        }
    },

    onMutation(state) {
        const section = this.findPromptSection();
        if (!section) {
            if (!state.missingLogged) {
                Logger.debug('vncPromptWriter: prompt section not found yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        const text = this.getPromptTextFromSection(section);
        if (!text) {
            return;
        }

        this.savePrompt(text, state);
    }
};
