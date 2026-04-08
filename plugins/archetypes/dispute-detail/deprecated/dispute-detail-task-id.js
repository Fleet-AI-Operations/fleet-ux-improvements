// ============= dispute-detail-task-id.js (deprecated) =============
// Deprecated: removed from the dispute-detail archetype load list. Kept in-repo for
// reference; native dispute detail already exposes View Task and timer in the header.

const VIEW_TASK_PATH_PREFIX = '/work/problems/view-task/';
const COPY_STYLE_ID = 'fleet-dispute-detail-task-id-copy-style';
const COPY_BTN_CLASS = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 rounded-sm pl-2 pr-2 text-xs font-mono';
const STACK_ATTR = 'data-fleet-dispute-detail-task-id-stack';

const plugin = {
    id: 'disputeDetailTaskId',
    name: 'Dispute Detail Task ID',
    description: '[Deprecated] Copyable Task ID in dispute detail header — no longer loaded',
    _version: '1.4',
    enabledByDefault: false,
    phase: 'mutation',
    initialState: {
        injectedLogged: false,
        missingLogged: false
    },

    onMutation(state) {
        if (document.querySelector(`[${STACK_ATTR}="1"]`)) {
            return;
        }
        const legacyRightGroup = this.findLegacyStackedColumnLayout();
        if (legacyRightGroup) {
            this.migrateLegacyStackedToTwoRows(legacyRightGroup, state);
            return;
        }
        const viewTaskLink = document.querySelector(`a[href*="${VIEW_TASK_PATH_PREFIX}"]`);
        if (!viewTaskLink) {
            if (!state.missingLogged) {
                Logger.debug('Dispute Detail Task ID: View Task link not found');
                state.missingLogged = true;
            }
            return;
        }
        const taskId = this.getTaskIdFromHref(viewTaskLink.getAttribute('href') || '');
        if (!taskId) {
            Logger.debug('Dispute Detail Task ID: could not parse task ID from href');
            return;
        }
        const rightGroup = viewTaskLink.closest('.flex.items-center.gap-2');
        if (!rightGroup || !rightGroup.parentElement) {
            Logger.warn('Dispute Detail Task ID: right header group not found');
            return;
        }
        const outerRow = rightGroup.parentElement;
        if (!this.isNativeDisputeHeaderOuterRow(outerRow, rightGroup)) {
            Logger.warn('Dispute Detail Task ID: header outer row validation failed');
            return;
        }
        this.ensureCopyStyle();
        const taskIdRow = this.buildTaskIdRow(taskId);
        const rowBottom = this.moveActionsIntoNewRow(rightGroup);
        rowBottom.setAttribute('data-fleet-dispute-detail-task-id-injected', '1');

        const rowTop = document.createElement('div');
        rowTop.className = 'flex items-center justify-between w-full';
        const disputesBack = outerRow.querySelector('a[href="/work/problems/disputes"]');
        if (!disputesBack) {
            Logger.warn('Dispute Detail Task ID: Disputes back link missing during inject');
            return;
        }
        rowTop.appendChild(disputesBack);
        rowTop.appendChild(taskIdRow);

        this.clearElement(outerRow);
        this.transformOuterRowToStack(outerRow);
        outerRow.appendChild(rowTop);
        outerRow.appendChild(rowBottom);
        outerRow.setAttribute(STACK_ATTR, '1');

        state.missingLogged = false;
        if (!state.injectedLogged) {
            Logger.log('Dispute Detail Task ID: injected two-row header (Disputes|Task ID, timer|View Task)');
            state.injectedLogged = true;
        }
    },

    /** v1.2 layout: task-ID column with actions row nested inside */
    findLegacyStackedColumnLayout() {
        const injected = document.querySelector('[data-fleet-dispute-detail-task-id-injected]');
        if (!injected?.classList.contains('flex')) return null;
        const col = injected.parentElement;
        if (!col?.classList.contains('flex-col') || !col.classList.contains('items-end')) return null;
        if (injected !== col.lastElementChild) return null;
        return injected;
    },

    migrateLegacyStackedToTwoRows(legacyRightGroup, state) {
        const rightColumn = legacyRightGroup.parentElement;
        const outerRow = rightColumn?.parentElement;
        const taskIdRow = rightColumn?.firstElementChild;
        if (
            !outerRow ||
            !(outerRow instanceof HTMLElement) ||
            !taskIdRow ||
            taskIdRow === legacyRightGroup
        ) {
            Logger.warn('Dispute Detail Task ID: legacy layout migration failed (unexpected DOM)');
            return;
        }
        const disputesBack = outerRow.querySelector('a[href="/work/problems/disputes"]');
        if (!disputesBack) {
            Logger.warn('Dispute Detail Task ID: Disputes back link missing during migration');
            return;
        }
        this.ensureCopyStyle();

        const rowBottom = document.createElement('div');
        rowBottom.className = 'flex items-center gap-2 justify-between w-full';
        legacyRightGroup.removeAttribute('data-fleet-dispute-detail-task-id-injected');
        while (legacyRightGroup.firstChild) {
            rowBottom.appendChild(legacyRightGroup.firstChild);
        }
        legacyRightGroup.remove();

        rightColumn.removeChild(taskIdRow);
        rightColumn.remove();

        const rowTop = document.createElement('div');
        rowTop.className = 'flex items-center justify-between w-full';
        rowTop.appendChild(disputesBack);
        rowTop.appendChild(taskIdRow);

        this.clearElement(outerRow);
        this.transformOuterRowToStack(outerRow);
        outerRow.appendChild(rowTop);
        outerRow.appendChild(rowBottom);
        rowBottom.setAttribute('data-fleet-dispute-detail-task-id-injected', '1');
        outerRow.setAttribute(STACK_ATTR, '1');

        Logger.log('Dispute Detail Task ID: migrated v1.2 header to two-row layout');
        state.missingLogged = false;
        if (!state.injectedLogged) {
            state.injectedLogged = true;
        }
    },

    buildTaskIdRow(taskId) {
        const label = document.createElement('span');
        label.className = 'text-xs text-muted-foreground font-medium';
        label.textContent = 'Task:';
        const copyBtn = this.buildCopyButton(taskId);
        const taskIdRow = document.createElement('div');
        taskIdRow.className = 'flex items-center gap-2';
        taskIdRow.appendChild(label);
        taskIdRow.appendChild(copyBtn);
        return taskIdRow;
    },

    moveActionsIntoNewRow(rightGroup) {
        const rowBottom = document.createElement('div');
        rowBottom.className = 'flex items-center gap-2 justify-between w-full';
        while (rightGroup.firstChild) {
            rowBottom.appendChild(rightGroup.firstChild);
        }
        rightGroup.remove();
        return rowBottom;
    },

    clearElement(el) {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    },

    transformOuterRowToStack(outerRow) {
        outerRow.classList.remove('items-center', 'justify-between');
        outerRow.classList.add('flex-col', 'gap-1');
    },

    isNativeDisputeHeaderOuterRow(outerRow, rightGroup) {
        if (!(outerRow instanceof HTMLElement)) return false;
        if (!outerRow.classList.contains('justify-between')) return false;
        const disputesBack = document.querySelector('a[href="/work/problems/disputes"]');
        if (!disputesBack || disputesBack.parentElement !== outerRow) return false;
        return Array.prototype.indexOf.call(outerRow.children, rightGroup) !== -1;
    },

    getTaskIdFromHref(href) {
        if (!href || typeof href !== 'string') return '';
        const idx = href.indexOf(VIEW_TASK_PATH_PREFIX);
        if (idx === -1) return '';
        const start = idx + VIEW_TASK_PATH_PREFIX.length;
        const rest = href.slice(start);
        const end = rest.indexOf('/');
        const id = end === -1 ? rest : rest.slice(0, end);
        return id ? id.trim() : '';
    },

    ensureCopyStyle() {
        if (document.getElementById(COPY_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = COPY_STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = '.fleet-dispute-id-copied { background-color: rgb(22 163 74) !important; color: white !important; border-color: rgb(22 163 74) !important; }';
        (document.head || document.documentElement).appendChild(style);
    },

    buildCopyButton(taskId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = COPY_BTN_CLASS;
        btn.textContent = taskId;
        btn.title = 'Copy Task ID';
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(taskId).then(() => {
                if (btn._fleetDisputeCopyFailT) {
                    clearTimeout(btn._fleetDisputeCopyFailT);
                    btn._fleetDisputeCopyFailT = null;
                }
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.transition = '';
                btn.classList.remove('fleet-dispute-id-copied');
                void btn.offsetHeight;
                btn.classList.add('fleet-dispute-id-copied');
                Logger.log('Dispute Detail Task ID: copied to clipboard');
                if (btn._fleetDisputeCopyOkT) clearTimeout(btn._fleetDisputeCopyOkT);
                btn._fleetDisputeCopyOkT = setTimeout(() => {
                    btn.classList.remove('fleet-dispute-id-copied');
                    btn._fleetDisputeCopyOkT = null;
                }, 1000);
            }).catch((err) => {
                Logger.error('Dispute Detail Task ID: failed to copy', err);
                if (btn._fleetDisputeCopyOkT) {
                    clearTimeout(btn._fleetDisputeCopyOkT);
                    btn._fleetDisputeCopyOkT = null;
                }
                btn.classList.remove('fleet-dispute-id-copied');
                if (btn._fleetDisputeCopyFailT) clearTimeout(btn._fleetDisputeCopyFailT);
                const prevTransition = btn.style.transition;
                btn.style.transition = 'none';
                btn.style.backgroundColor = 'rgb(239, 68, 68)';
                btn.style.color = '#ffffff';
                void btn.offsetHeight;
                btn.style.transition = 'background-color 500ms ease-out, color 500ms ease-out';
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn._fleetDisputeCopyFailT = setTimeout(() => {
                    btn.style.transition = prevTransition || '';
                    btn._fleetDisputeCopyFailT = null;
                }, 500);
            });
        });
        return btn;
    }
};
