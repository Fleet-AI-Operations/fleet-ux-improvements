// ============= dispute-prompt-scratchpad.js =============
// Collapsible notes area between the task prompt card and the writer dispute section.
// Default collapsed; contents are never persisted (fresh every load).

const plugin = {
    id: 'disputePromptScratchpad',
    name: 'Dispute Prompt Scratchpad',
    description: 'Collapsible scratchpad after the task prompt on dispute detail (not persisted)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        missingPromptLogged: false
    },

    onMutation(state) {
        if (document.querySelector('[data-fleet-dispute-prompt-scratchpad]')) {
            return;
        }

        const promptCard = this.findPromptCard();
        if (!promptCard || !promptCard.parentElement) {
            if (!state.missingPromptLogged) {
                Logger.debug(`${this.id}: task prompt card not found yet`);
                state.missingPromptLogged = true;
            }
            return;
        }
        state.missingPromptLogged = false;

        const wrap = this.buildScratchpad();
        promptCard.insertAdjacentElement('afterend', wrap);
        Logger.log(`${this.id}: inserted collapsible scratchpad after task prompt`);
    },

    findPromptCard() {
        const disputesBack = document.querySelector('a[href="/work/problems/disputes"]');
        const host = disputesBack?.closest('div.p-4');
        const card = host?.querySelector(':scope > div.rounded-xl.text-card-foreground.border.bg-card');
        if (card?.querySelector('pre.text-sm.whitespace-pre-wrap')) return card;
        const pre = document.querySelector('pre.text-sm.whitespace-pre-wrap.font-mono.text-foreground');
        return pre?.closest('div.rounded-xl.text-card-foreground.border.bg-card') || null;
    },

    buildScratchpad() {
        const wrap = document.createElement('div');
        wrap.className = 'mt-4 mb-4';
        wrap.dataset.fleetDisputePromptScratchpad = 'true';

        const inner = document.createElement('div');
        inner.setAttribute('data-state', 'closed');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'inline-flex items-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm text-xs w-full justify-between p-2';
        btn.setAttribute('aria-expanded', 'false');

        const label = document.createElement('span');
        label.className = 'text-sm font-medium';
        label.textContent = 'Scratchpad';

        let chevron = this.createChevronSvg(false);
        btn.appendChild(label);
        btn.appendChild(chevron);

        const panel = document.createElement('div');
        panel.className = 'mt-2';
        panel.hidden = true;

        const textarea = document.createElement('textarea');
        textarea.className =
            'flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y';
        textarea.placeholder = 'QA Scratchpad';

        panel.appendChild(textarea);

        btn.addEventListener('click', () => {
            const open = panel.hidden;
            panel.hidden = !open;
            inner.setAttribute('data-state', open ? 'open' : 'closed');
            btn.setAttribute('aria-expanded', String(open));
            const next = this.createChevronSvg(open);
            chevron.replaceWith(next);
            chevron = next;
            Logger.log(`${this.id}: user toggled scratchpad`, { expanded: open });
        });

        inner.appendChild(btn);
        inner.appendChild(panel);
        wrap.appendChild(inner);

        return wrap;
    },

    createChevronSvg(expanded) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'h-4 w-4');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', expanded ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6');
        svg.appendChild(path);
        return svg;
    }
};
