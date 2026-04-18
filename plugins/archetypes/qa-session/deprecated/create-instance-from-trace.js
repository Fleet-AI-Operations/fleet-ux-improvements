// ============= create-instance-from-trace.js =============
// Session Trace Review: "Create Instance" in the top bar — triggers Copy Seed Data when that
// plugin’s button exists, then opens the dashboard create-instance page in a new tab.

const COPY_SEED_ATTR = 'data-fleet-session-copy-seed-data';
const CREATE_INSTANCE_ATTR = 'data-fleet-session-create-instance';
const CREATE_INSTANCE_URL = 'https://www.fleetai.com/dashboard/instances/create';
/** Delay after programmatic copy click so clipboard can settle before navigating. */
const OPEN_TAB_AFTER_COPY_MS = 250;

const plugin = {
    id: 'sessionTraceCreateInstance',
    name: 'Session Trace Create Instance',
    description:
        'Adds Create Instance in the trace top bar: copies seed data via the Copy Seed Data control when present, then opens the create-instance dashboard in a new tab. Please note: this functionality only works for Senior Core members.',
    _version: '1.1',
    enabledByDefault: false,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        buttonLogged: false,
        lastPath: null
    },

    findSkipButton() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const span = btn.querySelector('span');
            if (span && span.textContent.trim() === 'Skip') {
                return btn;
            }
        }
        return null;
    },

    onMutation(state) {
        const path = typeof location !== 'undefined' ? location.pathname : '';
        if (state.lastPath !== path) {
            state.lastPath = path;
            state.buttonLogged = false;
            state.missingLogged = false;
            const orphan = document.querySelector(`button[${CREATE_INSTANCE_ATTR}]`);
            if (orphan) orphan.remove();
        }

        const skipBtn = this.findSkipButton();
        if (!skipBtn) {
            if (!state.missingLogged) {
                Logger.debug('session-trace-create-instance: Skip button not found in top bar');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureCreateInstanceButton(skipBtn, state);
    },

    ensureCreateInstanceButton(skipBtn, state) {
        const container = skipBtn.parentElement;
        if (!container) return;

        const viewEvalLink = container.querySelector('a[data-fleet-session-view-eval-task]');
        const anchorAfter = viewEvalLink || skipBtn;
        const copyBtn = container.querySelector(`button[${COPY_SEED_ATTR}]`);

        let createBtn = container.querySelector(`button[${CREATE_INSTANCE_ATTR}]`);
        if (createBtn && createBtn.parentElement !== container) {
            createBtn.remove();
            createBtn = null;
        }

        if (!createBtn) {
            createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.setAttribute(CREATE_INSTANCE_ATTR, 'true');
            createBtn.setAttribute('data-fleet-plugin', this.id);
            createBtn.className =
                'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm px-3 text-xs shrink-0';
            createBtn.textContent = 'Create Instance';
            createBtn.title =
                'Copy seed data to the clipboard when available, then open Create Instance on the dashboard';
            createBtn.setAttribute('aria-label', 'Copy seed data and open create instance page');

            createBtn.addEventListener('click', () => {
                const toolbar = createBtn.parentElement;
                const seedBtn = toolbar
                    ? toolbar.querySelector(`button[${COPY_SEED_ATTR}]`)
                    : null;
                const openCreateTab = () => {
                    const win = window.open(CREATE_INSTANCE_URL, '_blank', 'noopener,noreferrer');
                    if (win) {
                        Logger.log('session-trace-create-instance: opened dashboard create instance page');
                    } else {
                        Logger.warn(
                            'session-trace-create-instance: window.open returned null (popup blocked?)'
                        );
                    }
                };

                if (seedBtn) {
                    seedBtn.click();
                    Logger.log(
                        'session-trace-create-instance: triggered Copy Seed Data before opening create page'
                    );
                    window.setTimeout(openCreateTab, OPEN_TAB_AFTER_COPY_MS);
                } else {
                    Logger.debug(
                        'session-trace-create-instance: Copy Seed Data button not present; opening create page without copy'
                    );
                    openCreateTab();
                }
            });

            const insertBefore =
                copyBtn != null ? copyBtn.nextSibling : anchorAfter.nextSibling;
            container.insertBefore(createBtn, insertBefore);
            if (!state.buttonLogged) {
                Logger.log('session-trace-create-instance: Create Instance button added to top bar');
                state.buttonLogged = true;
            }
        } else if (copyBtn) {
            if (createBtn.previousElementSibling !== copyBtn) {
                container.insertBefore(createBtn, copyBtn.nextSibling);
            }
        } else if (createBtn.previousElementSibling !== anchorAfter) {
            container.insertBefore(createBtn, anchorAfter.nextSibling);
        }
    }
};
