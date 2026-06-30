// ============= flag-as-bug-modal-improvements.js =============
// Dispute "Flag as Bugged" dialog: split submit into reject-dispute vs approve-dispute.
// Context: local/context/disputes/flag-as-bug-modal.html

const DIALOG_TITLE = 'Flag as Bugged';
const APPROVE_LABEL = 'Flag as Bugged (Approve Dispute)';
const REJECT_LABEL = 'Flag as Bugged (Reject Dispute)';
const MIN_DESCRIPTION_CHARS = 100;
const VIEW_TASK_PREFIX = '/work/problems/view-task/';
const ENHANCED_ATTR = 'data-fleet-flag-bug-modal-enhanced';
const REJECT_BTN_ATTR = 'data-fleet-flag-bug-reject';
const APPROVE_BTN_ATTR = 'data-fleet-flag-bug-approve';
const CONTEXT_KEY = '__fleetFlagBugModalContext';

const plugin = {
    id: 'flagAsBugModalImprovements',
    name: 'Flag-as-Bug Modal Improvements',
    description:
        'Adds Flag as Bugged (Reject Dispute) before native submit; renames submit to Flag as Bugged (Approve Dispute)',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingLogged: false,
        injectedLogged: false,
        flagBugListenerInstalled: false,
        lastDialog: null
    },

    onMutation(state) {
        if (!state.flagBugListenerInstalled) {
            this.installFlagBugClickCapture(state);
        }

        const dialog = this.findFlagBugDialog();
        if (!dialog) {
            if (state.lastDialog) {
                state.lastDialog = null;
                state.injectedLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('flagAsBugModalImprovements: Flag as Bugged dialog not open');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        if (dialog.getAttribute(ENHANCED_ATTR) === '1') {
            state.lastDialog = dialog;
            return;
        }

        const enhanced = this.enhanceDialog(dialog, state);
        if (enhanced) {
            dialog.setAttribute(ENHANCED_ATTR, '1');
            state.lastDialog = dialog;
            if (!state.injectedLogged) {
                Logger.log('flagAsBugModalImprovements: reject + approve submit buttons injected');
                state.injectedLogged = true;
            }
        }
    },

    installFlagBugClickCapture(state) {
        const self = this;
        document.addEventListener('click', (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
            if (!btn) return;
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text.includes('Flag as Bug')) return;
            const ctx = self.resolveIdsFromClickTarget(btn);
            if (ctx.disputeId || ctx.evalTaskId) {
                const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                pageWindow[CONTEXT_KEY] = ctx;
            }
        }, true);
        state.flagBugListenerInstalled = true;
        Logger.debug('flagAsBugModalImprovements: Flag as Bugged click capture installed');
    },

    findFlagBugDialog() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && heading.textContent.trim() === DIALOG_TITLE) {
                return dialog;
            }
        }
        return null;
    },

    enhanceDialog(dialog, state) {
        const approveBtn = this.findNativeApproveButton(dialog);
        if (!approveBtn) {
            Logger.warn('flagAsBugModalImprovements: native approve submit not found');
            return false;
        }

        this.renameApproveButton(approveBtn);
        approveBtn.setAttribute(APPROVE_BTN_ATTR, '1');
        approveBtn.setAttribute('data-fleet-plugin', this.id);

        if (dialog.querySelector(`[${REJECT_BTN_ATTR}]`)) {
            return true;
        }

        const rejectBtn = approveBtn.cloneNode(true);
        rejectBtn.setAttribute(REJECT_BTN_ATTR, '1');
        rejectBtn.setAttribute('data-fleet-plugin', this.id);
        rejectBtn.removeAttribute(APPROVE_BTN_ATTR);
        this.setButtonLabel(rejectBtn, REJECT_LABEL);
        rejectBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            void this.handleRejectSubmit(dialog, rejectBtn, approveBtn);
        });

        approveBtn.parentNode.insertBefore(rejectBtn, approveBtn);
        return true;
    },

    findNativeApproveButton(dialog) {
        const footer = dialog.querySelector('div.flex.sm\\:justify-end, div.flex[class*="justify-end"]');
        const scope = footer || dialog;
        const buttons = scope.querySelectorAll('button');
        for (const btn of buttons) {
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (btn.classList.contains('bg-amber-600') || text === DIALOG_TITLE || text === APPROVE_LABEL) {
                if (btn.hasAttribute(REJECT_BTN_ATTR)) continue;
                return btn;
            }
        }
        return null;
    },

    renameApproveButton(btn) {
        this.setButtonLabel(btn, APPROVE_LABEL);
    },

    setButtonLabel(btn, label) {
        const nodes = Array.from(btn.childNodes);
        let textUpdated = false;
        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                node.textContent = label;
                textUpdated = true;
                break;
            }
        }
        if (!textUpdated) {
            const svg = btn.querySelector('svg');
            btn.textContent = '';
            if (svg) btn.appendChild(svg);
            btn.appendChild(document.createTextNode(label));
        }
    },

    readBugReason(dialog) {
        const labels = dialog.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
        for (const label of labels) {
            if (!label.textContent.includes('Bug reason')) continue;
            const section = label.parentElement;
            const trigger = section && section.querySelector('button[data-slot="button"]');
            if (!trigger) continue;
            const span = trigger.querySelector('span');
            const text = (span ? span.textContent : trigger.textContent) || '';
            const reason = text.replace(/\s+/g, ' ').trim();
            if (!reason || /select a reason/i.test(reason)) return '';
            return reason;
        }
        return '';
    },

    readDescription(dialog) {
        const textarea = dialog.querySelector('textarea');
        return textarea ? String(textarea.value || '').trim() : '';
    },

    resolveIdsFromClickTarget(btn) {
        const out = { disputeId: '', evalTaskId: '' };
        const idsWrap = btn.closest('[data-fleet-dispute-id]');
        if (idsWrap) {
            out.disputeId = String(idsWrap.getAttribute('data-fleet-dispute-id') || '').trim();
            const copyBtns = idsWrap.querySelectorAll('button');
            for (const copyBtn of copyBtns) {
                const title = copyBtn.getAttribute('title') || '';
                const val = (copyBtn.textContent || '').trim();
                if (title === 'Copy Task ID' && val) {
                    out.evalTaskId = val;
                    break;
                }
            }
        }
        const fromPath = this.disputeIdFromPathname();
        if (fromPath) out.disputeId = fromPath;
        const fromViewTask = this.evalTaskIdFromViewTaskLink();
        if (fromViewTask) out.evalTaskId = fromViewTask;
        return out;
    },

    async fetchActiveDisputeIds() {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const req = pageWindow.fetch || fetch;
        const url = pageWindow.location.origin + '/api/disputes?limit=1';
        const res = await req.call(pageWindow, url, {
            method: 'GET',
            credentials: 'include',
            headers: { accept: 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const disputeId = data && data.activeDisputeId != null
            ? String(data.activeDisputeId).trim()
            : '';
        let evalTaskId = '';
        if (disputeId && Array.isArray(data.disputes)) {
            const match = data.disputes.find((d) => String(d.id) === disputeId);
            if (match && match.eval_task_id) {
                evalTaskId = String(match.eval_task_id).trim();
            }
        }
        return { disputeId, evalTaskId };
    },

    resolveIdsFromStashAndDom() {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const stashed = pageWindow[CONTEXT_KEY] || {};
        let disputeId = String(stashed.disputeId || '').trim();
        let evalTaskId = String(stashed.evalTaskId || '').trim();

        if (!disputeId) disputeId = this.disputeIdFromPathname();
        if (!evalTaskId) evalTaskId = this.evalTaskIdFromViewTaskLink();

        if (!disputeId || !evalTaskId) {
            const fromDom = this.resolveIdsFromDocument();
            if (!disputeId) disputeId = fromDom.disputeId;
            if (!evalTaskId) evalTaskId = fromDom.evalTaskId;
        }

        return { disputeId, evalTaskId };
    },

    async resolveIdsForSubmit(_dialog) {
        let disputeId = '';
        let evalTaskId = '';

        try {
            const fromApi = await this.fetchActiveDisputeIds();
            disputeId = fromApi.disputeId;
            evalTaskId = fromApi.evalTaskId;
            if (disputeId) {
                Logger.debug('flagAsBugModalImprovements: dispute id from active lease — ' + disputeId);
            }
        } catch (e) {
            Logger.warn('flagAsBugModalImprovements: active dispute fetch failed, using DOM fallbacks', e);
            return this.resolveIdsFromStashAndDom();
        }

        if (!evalTaskId) evalTaskId = this.evalTaskIdFromViewTaskLink();
        if (!disputeId) disputeId = this.disputeIdFromPathname();

        if (!disputeId || !evalTaskId) {
            const fromDom = this.resolveIdsFromDocument();
            if (!disputeId) disputeId = fromDom.disputeId;
            if (!evalTaskId) evalTaskId = fromDom.evalTaskId;
        }

        return { disputeId, evalTaskId };
    },

    resolveIdsFromDocument() {
        const out = { disputeId: '', evalTaskId: '' };
        const idsWrap = document.querySelector('[data-fleet-dispute-id]');
        if (idsWrap) {
            out.disputeId = String(idsWrap.getAttribute('data-fleet-dispute-id') || '').trim();
            const copyBtns = idsWrap.querySelectorAll('button');
            for (const copyBtn of copyBtns) {
                const title = copyBtn.getAttribute('title') || '';
                const val = (copyBtn.textContent || '').trim();
                if (title === 'Copy Task ID' && val) {
                    out.evalTaskId = val;
                    break;
                }
            }
        }
        if (!out.disputeId) out.disputeId = this.disputeIdFromPathname();
        if (!out.evalTaskId) out.evalTaskId = this.evalTaskIdFromViewTaskLink();
        return out;
    },

    disputeIdFromPathname() {
        const path = typeof location !== 'undefined' ? location.pathname : '';
        const m = path.match(/\/work\/problems\/disputes\/(\d+)/);
        return m ? m[1] : '';
    },

    evalTaskIdFromViewTaskLink() {
        const link = document.querySelector(`a[href*="${VIEW_TASK_PREFIX}"]`);
        if (!link) return '';
        const href = link.getAttribute('href') || '';
        const idx = href.indexOf(VIEW_TASK_PREFIX);
        if (idx === -1) return '';
        const rest = href.slice(idx + VIEW_TASK_PREFIX.length);
        const end = rest.indexOf('/');
        const id = end === -1 ? rest : rest.slice(0, end);
        return id ? id.trim() : '';
    },

    scrapeReviewDurationSeconds() {
        const candidates = document.querySelectorAll('[class*="font-mono"], [data-ui*="timer"], time');
        for (const el of candidates) {
            const text = (el.textContent || '').trim();
            const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (!m) continue;
            const h = m[3] != null ? parseInt(m[1], 10) : 0;
            const min = m[3] != null ? parseInt(m[2], 10) : parseInt(m[1], 10);
            const sec = m[3] != null ? parseInt(m[3], 10) : parseInt(m[2], 10);
            return h * 3600 + min * 60 + sec;
        }
        return 0;
    },

    async handleRejectSubmit(dialog, rejectBtn, approveBtn) {
        const reason = this.readBugReason(dialog);
        const description = this.readDescription(dialog);
        const { disputeId, evalTaskId } = await this.resolveIdsForSubmit(dialog);

        if (!reason) {
            Logger.warn('flagAsBugModalImprovements: reject blocked — bug reason not selected');
            this.flashButtonFailure(rejectBtn);
            return;
        }
        if (description.length < MIN_DESCRIPTION_CHARS) {
            Logger.warn('flagAsBugModalImprovements: reject blocked — description under '
                + MIN_DESCRIPTION_CHARS + ' chars');
            this.flashButtonFailure(rejectBtn);
            return;
        }
        if (!disputeId || !evalTaskId) {
            Logger.warn('flagAsBugModalImprovements: reject blocked — missing dispute or task id');
            this.flashButtonFailure(rejectBtn);
            return;
        }

        rejectBtn.disabled = true;
        approveBtn.disabled = true;

        const resolutionReason = 'Flagged as product bug: [' + reason + '] ' + description;
        const reviewSeconds = this.scrapeReviewDurationSeconds();
        const referer = location.origin + '/work/problems/disputes'
            + (disputeId ? '/' + encodeURIComponent(disputeId) : '');

        try {
            await this.fleetWebPost(
                '/api/flag-bugged/' + encodeURIComponent(evalTaskId),
                { reason, description },
                referer
            );
            await this.fleetWebPost(
                '/api/disputes/' + encodeURIComponent(disputeId) + '/resolve',
                {
                    status: 'rejected',
                    resolutionReason,
                    disputeReviewDurationSeconds: reviewSeconds,
                    skipWorkflowSignal: true
                },
                referer
            );
            Logger.log('flagAsBugModalImprovements: flag-bugged + reject resolve — dispute '
                + disputeId);
            this.flashButtonSuccess(rejectBtn);
            this.closeDialog(dialog);
        } catch (e) {
            Logger.error('flagAsBugModalImprovements: reject submit failed — dispute ' + disputeId, e);
            this.flashButtonFailure(rejectBtn);
            rejectBtn.disabled = false;
            approveBtn.disabled = false;
        }
    },

    async fleetWebPost(path, body, referer) {
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const requestFetch = pageWindow.fetch || fetch;
        const url = path.startsWith('http') ? path : pageWindow.location.origin + path;
        const res = await requestFetch.call(pageWindow, url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
                referer
            },
            body: JSON.stringify(body)
        });
        const text = await res.text().catch(() => '');
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch (_e) { /* non-JSON */ }
        if (!res.ok) {
            throw new Error('HTTP ' + res.status + ': ' + (text || res.statusText));
        }
        if (json && json.success === false) {
            throw new Error('API reported failure');
        }
        return json;
    },

    closeDialog(dialog) {
        const closeBtn = Array.from(dialog.querySelectorAll('button')).find((b) => {
            const sr = b.querySelector('.sr-only');
            return sr && (sr.textContent || '').trim() === 'Close';
        });
        if (closeBtn) {
            closeBtn.click();
            return;
        }
        const cancel = Array.from(dialog.querySelectorAll('button')).find((b) => {
            return (b.textContent || '').trim() === 'Cancel';
        });
        if (cancel) cancel.click();
    },

    flashButtonSuccess(btn) {
        if (!btn) return;
        const prevBg = btn.style.backgroundColor;
        const prevColor = btn.style.color;
        const prevBorder = btn.style.borderColor;
        btn.style.backgroundColor = 'rgb(22 163 74)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'rgb(22 163 74)';
        setTimeout(() => {
            btn.style.backgroundColor = prevBg;
            btn.style.color = prevColor;
            btn.style.borderColor = prevBorder;
        }, 1000);
    },

    flashButtonFailure(btn) {
        if (!btn) return;
        const prevBg = btn.style.backgroundColor;
        const prevTransition = btn.style.transition;
        btn.style.transition = 'none';
        btn.style.backgroundColor = 'rgb(239, 68, 68)';
        void btn.offsetHeight;
        btn.style.transition = 'background-color 500ms ease-out';
        btn.style.backgroundColor = prevBg || '';
        setTimeout(() => {
            btn.style.transition = prevTransition || '';
        }, 500);
    }
};
