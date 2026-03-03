// ============= dispute-detail-task-id.js =============
// Injects a copyable Task ID button in the dispute detail header (from View Task link).

const VIEW_TASK_PATH_PREFIX = '/work/problems/view-task/';
const COPY_STYLE_ID = 'fleet-dispute-detail-task-id-copy-style';
const COPY_BTN_CLASS = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-7 rounded-sm pl-2 pr-2 text-xs font-mono';

const plugin = {
    id: 'disputeDetailTaskId',
    name: 'Dispute Detail Task ID',
    description: 'Shows a copyable Task ID in the dispute detail header from the View Task link',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        injectedLogged: false,
        missingLogged: false
    },

    onMutation(state) {
        if (document.querySelector('[data-fleet-dispute-detail-task-id-injected]')) {
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
        this.ensureCopyStyle();
        const label = document.createElement('span');
        label.className = 'text-xs text-muted-foreground font-medium';
        label.textContent = 'Task:';
        const copyBtn = this.buildCopyButton(taskId);
        rightGroup.insertBefore(copyBtn, rightGroup.firstChild);
        rightGroup.insertBefore(label, rightGroup.firstChild);
        rightGroup.setAttribute('data-fleet-dispute-detail-task-id-injected', '1');
        state.missingLogged = false;
        if (!state.injectedLogged) {
            Logger.log('Dispute Detail Task ID: injected copyable task ID in header');
            state.injectedLogged = true;
        }
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
                btn.classList.add('fleet-dispute-id-copied');
                Logger.log('Dispute Detail Task ID: copied to clipboard');
                setTimeout(() => btn.classList.remove('fleet-dispute-id-copied'), 3000);
            }).catch((err) => {
                Logger.error('Dispute Detail Task ID: failed to copy', err);
            });
        });
        return btn;
    }
};
