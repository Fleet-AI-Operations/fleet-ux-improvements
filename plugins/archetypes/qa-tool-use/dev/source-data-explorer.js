// ============= source-data-explorer.js =============
// QA action-bar placement: shared Context.sourceDataExplorer library.

const plugin = {
    id: 'sourceDataExplorer',
    name: 'Explore GUI',
    description:
        'Adds an Explore GUI control that opens the underlying environment in a new tab so you can inspect data without parsing JSON. This links to the actual instance that your tool calls are modifying. BE AWARE: if you make changes inside the instance, they will be reflected in your tool calls. Only use the tools to perform write actions, or you may run into unexpected problems when your submission is graded.',
    _version: '3.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, interceptionInstalled: false },

    findButtonContainer() {
        const centers = document.querySelectorAll(
            'div.mx-auto.flex.flex-1.items-center.justify-center.gap-1, ' +
                'div.flex-1.flex.items-center.justify-center.gap-1.mx-auto'
        );
        for (const el of centers) {
            const text = el.textContent || '';
            if (
                text.includes('Reset Instance') ||
                text.includes('Approve') ||
                text.includes('Request Revisions')
            ) {
                return el;
            }
        }

        const resetBtn = Array.from(document.querySelectorAll('button')).find((btn) =>
            (btn.textContent || '').includes('Reset Instance')
        );
        if (!resetBtn) return null;
        return (
            resetBtn.closest('div.mx-auto.flex.flex-1.items-center.justify-center.gap-1') ||
            resetBtn.closest('div.flex-1.flex.items-center.justify-center.gap-1') ||
            resetBtn.parentElement
        );
    },

    mountButton(button, container) {
        const resetButton = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Reset Instance')
        );
        if (resetButton) {
            const insertionTarget =
                resetButton.parentElement === container
                    ? resetButton
                    : Array.from(container.children).find((child) => child.contains(resetButton));
            if (insertionTarget && insertionTarget.parentElement === container) {
                insertionTarget.insertAdjacentElement('afterend', button);
                return;
            }
        }
        container.appendChild(button);
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
