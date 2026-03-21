
// ============= progress-prompt-expand.js =============
const plugin = {
    id: 'progressPromptExpand',
    name: 'Expanded Submitted Prompts',
    description: 'Hover over task items to expand truncated prompts',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },
    subOptions: [
        {
            id: 'copyOnClick',
            name: 'Click to copy prompt',
            description: 'When expanded, click the prompt text to copy it to the clipboard',
            enabledByDefault: true
        },
        {
            id: 'alwaysExpanded',
            name: 'Always expand prompts',
            description: 'Keep all prompts fully expanded without needing to hover',
            enabledByDefault: false
        }
    ],

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('progress-prompt-expand: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const tables = main.querySelectorAll('table');
        const taskCells = [];
        for (const table of tables) {
            const secondHeader = table.querySelector('thead th:nth-child(2)');
            if (!secondHeader || secondHeader.textContent.trim() !== 'Task') continue;
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                const cell = row.querySelector('td:nth-child(2)');
                if (!cell || !cell.classList.contains('truncate')) continue;
                taskCells.push({ row, cell });
            }
        }

        if (taskCells.length === 0) {
            if (!state.missingLogged) {
                Logger.debug('progress-prompt-expand: no Task column cells found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        let modified = 0;

        const alwaysExpanded = Storage.getSubOptionEnabled(this.id, 'alwaysExpanded', false);

        for (const { row, cell } of taskCells) {
            if (cell.hasAttribute('data-wf-progress-expand')) continue;

            const fragment = document.createDocumentFragment();
            const wrapper = document.createElement('div');
            wrapper.className = 'fleet-progress-prompt-inner';
            wrapper.style.cssText = alwaysExpanded
                ? 'overflow: hidden; white-space: normal;'
                : 'max-height: 1.5em; overflow: hidden; transition: max-height 0.25s ease-out, background-color 0.15s ease; white-space: normal;';
            const inner = document.createElement('div');
            inner.style.cssText = 'transition: background-color 0.15s ease;';
            while (cell.firstChild) inner.appendChild(cell.firstChild);
            wrapper.appendChild(inner);
            cell.appendChild(wrapper);
            cell.classList.remove('truncate');

            const pluginId = this.id;
            const copyEnabled = Storage.getSubOptionEnabled(pluginId, 'copyOnClick', true);
            if (copyEnabled) {
                wrapper.setAttribute('role', 'button');
                wrapper.setAttribute('title', 'Click to copy');
                wrapper.style.cursor = 'pointer';
                wrapper.addEventListener('mouseenter', () => {
                    wrapper.style.backgroundColor = '#1a1a1a';
                    inner.style.backgroundColor = 'var(--background, #fafafa)';
                });
                wrapper.addEventListener('mouseleave', () => {
                    wrapper.style.backgroundColor = '';
                    inner.style.backgroundColor = '';
                });
                wrapper.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!Storage.getSubOptionEnabled(pluginId, 'copyOnClick', true)) return;
                    const text = inner.textContent.trim();
                    const flashSuccess = () => {
                        if (inner._wfPromptCopyT) clearTimeout(inner._wfPromptCopyT);
                        inner.style.transition = '';
                        inner.style.backgroundColor = 'rgb(34, 197, 94)';
                        inner.style.color = '#ffffff';
                        inner._wfPromptCopyT = setTimeout(() => {
                            inner.style.backgroundColor = '';
                            inner.style.color = '';
                            inner._wfPromptCopyT = null;
                        }, 1000);
                    };
                    const flashFailure = () => {
                        if (inner._wfPromptCopyT) clearTimeout(inner._wfPromptCopyT);
                        const prevT = inner.style.transition;
                        inner.style.transition = 'none';
                        inner.style.backgroundColor = 'rgb(239, 68, 68)';
                        inner.style.color = '#ffffff';
                        void inner.offsetHeight;
                        inner.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
                        inner.style.backgroundColor = '';
                        inner.style.color = '';
                        inner._wfPromptCopyT = setTimeout(() => {
                            inner.style.transition = prevT || '';
                            inner._wfPromptCopyT = null;
                        }, 500);
                    };
                    if (!text) {
                        Logger.debug('progress-prompt-expand: no prompt text to copy');
                        flashFailure();
                        return;
                    }
                    navigator.clipboard.writeText(text).then(() => {
                        Logger.log('Prompt copied to clipboard');
                        flashSuccess();
                    }).catch((err) => {
                        Logger.error('Failed to copy prompt:', err);
                        flashFailure();
                    });
                });
            }

            cell.setAttribute('data-wf-progress-expand', 'true');

            if (alwaysExpanded) {
                wrapper.style.maxHeight = 'none';
                row.style.overflow = 'visible';
            } else {
                const collapse = () => {
                    wrapper.style.maxHeight = '1.5em';
                    row.style.overflow = '';
                };

                const expand = () => {
                    wrapper.style.maxHeight = '2000px';
                    const fullHeight = wrapper.scrollHeight;
                    wrapper.style.maxHeight = fullHeight + 'px';
                    row.style.overflow = 'visible';
                };

                row.addEventListener('mouseenter', expand);
                row.addEventListener('mouseleave', collapse);
            }

            modified++;
        }

        if (modified > 0) {
            Logger.log(`Progress prompt hover-expand enabled for ${modified} row(s)`);
        }
    }
};
