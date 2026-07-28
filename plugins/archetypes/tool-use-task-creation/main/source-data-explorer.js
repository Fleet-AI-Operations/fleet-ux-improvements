// ============= source-data-explorer.js =============
// Creation placement: shared Context.sourceDataExplorer library.

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Explore GUI',
    description:
        'Adds an Explore GUI control that opens the underlying environment in a new tab so you can inspect data without parsing JSON. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, interceptionInstalled: false },

    findButtonContainer() {
        const workflowEditor = document.querySelector('[data-ui="workflow-editor"]');
        const headerScope = workflowEditor?.previousElementSibling || document;

        const candidates = headerScope.querySelectorAll('div.flex.gap-1.ml-auto.items-center');
        let buttonContainer = Array.from(candidates).find(
            (el) =>
                el.classList.contains('mr-0') ||
                (el.classList.contains('flex') &&
                    el.classList.contains('gap-1') &&
                    el.classList.contains('items-center') &&
                    getComputedStyle(el).marginLeft === 'auto')
        );

        if (!buttonContainer) {
            const buttons = Array.from(headerScope.querySelectorAll('button'));
            const resetBtn = buttons.find((btn) => {
                const text = btn.textContent.trim();
                return text === 'Reset Instance' || text.includes('Reset Instance');
            });
            if (resetBtn) {
                buttonContainer = resetBtn.closest('div.flex.gap-1');
            }
        }

        if (!buttonContainer) {
            const buttons = Array.from(headerScope.querySelectorAll('button'));
            const saveBtn = buttons.find((btn) => btn.textContent.trim() === 'Save');
            if (saveBtn) {
                const parent = saveBtn.parentElement;
                if (parent && parent.classList.contains('flex') && parent.classList.contains('gap-1')) {
                    buttonContainer = parent;
                }
            }
        }

        return buttonContainer || null;
    },

    mountButton(button, container) {
        container.insertBefore(button, container.firstChild);
    },

    onMutation(state, context) {
        const api = Context.sourceDataExplorer;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, context, {
            pluginId: this.id,
            logTag: this.id,
            buttonContainer: this.findButtonContainer(),
            mountButton: (btn, container) => this.mountButton(btn, container)
        });
    }
};
