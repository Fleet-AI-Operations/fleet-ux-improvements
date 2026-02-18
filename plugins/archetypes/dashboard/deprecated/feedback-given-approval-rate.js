// ============= feedback-given-approval-rate.js =============
// Deprecated: functionality merged into feedback-given-stats.js
const plugin = {
    id: 'feedbackGivenApprovalRate',
    name: 'Feedback Given Approval Rate',
    description: 'Show approval rate on the Feedback Given stat when both approved and feedback requested counts exist',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-approval-rate: main not found');
                state.missingLogged = true;
            }
            return;
        }

        const feedbackGivenHeading = main.querySelector('h3.tracking-tight.text-base.font-medium.text-primary');
        if (!feedbackGivenHeading || feedbackGivenHeading.textContent.trim() !== 'Feedback Given') {
            if (!state.missingLogged) {
                Logger.debug('feedback-given-approval-rate: Feedback Given card not found');
                state.missingLogged = true;
            }
            return;
        }

        const card = feedbackGivenHeading.closest('.rounded-xl');
        if (!card || card.hasAttribute('data-wf-feedback-approval-rate')) {
            return;
        }

        const subtextEl = card.querySelector('p.text-sm.text-muted-foreground');
        if (!subtextEl || !/approved.*feedback requested|feedback requested.*approved/i.test(subtextEl.textContent)) {
            Logger.debug('feedback-given-approval-rate: subtext paragraph not found in Feedback Given card');
            return;
        }

        const text = subtextEl.textContent.trim();
        const match = text.match(/(\d+)\s+approved,\s*(\d+)\s+feedback\s+requested/i);
        if (!match) {
            Logger.debug('feedback-given-approval-rate: could not parse approved/feedback requested from:', text);
            card.setAttribute('data-wf-feedback-approval-rate', 'no-match');
            return;
        }

        const approved = parseInt(match[1], 10);
        const feedbackRequested = parseInt(match[2], 10);
        const total = approved + feedbackRequested;
        if (total === 0) {
            card.setAttribute('data-wf-feedback-approval-rate', 'zero-total');
            return;
        }

        const rate = Math.round((approved / total) * 100);
        const suffix = ` (${rate}% approval rate)`;
        if (subtextEl.textContent.includes('approval rate)')) {
            return;
        }
        subtextEl.textContent = text + suffix;
        card.setAttribute('data-wf-feedback-approval-rate', 'true');
        Logger.log('feedback-given-approval-rate: added approval rate to Feedback Given stat', { approved, feedbackRequested, rate });
    }
};
