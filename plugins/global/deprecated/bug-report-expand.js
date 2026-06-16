// ============= bug-report-expand.js =============
const plugin = {
    id: 'bugReportExpand',
    name: 'Bug Report Expand',
    description: 'Makes bug report cards expandable to see full text',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },
    
    onMutation(state, context) {
        const bugReportCards = Context.dom.queryAll('div.p-3.bg-muted\\/50.rounded-lg.text-sm', {
            context: `${this.id}.bugReportCards`
        });
        if (bugReportCards.length === 0) {
            if (!state.missingLogged) {
                Logger.debug('No bug report cards found to expand');
                state.missingLogged = true;
            }
            return;
        }

        let modified = 0;

        bugReportCards.forEach(card => {
            if (card.hasAttribute('data-wf-expand-enabled')) return;

            const contentWrapper = Context.dom.query('div.flex.items-start.justify-between.gap-2 > div.flex-1.min-w-0', {
                root: card,
                context: `${this.id}.contentWrapper`
            });
            if (!contentWrapper) return;

            const textParagraph = Context.dom.query('p.text-muted-foreground.text-xs.line-clamp-2', {
                root: contentWrapper,
                context: `${this.id}.textParagraph`
            });
            if (!textParagraph) return;

            card.setAttribute('data-wf-expand-enabled', 'true');
            contentWrapper.style.cursor = 'pointer';
            contentWrapper.setAttribute('title', 'Click to expand/collapse');

            const originalText = textParagraph.textContent;
            let isExpanded = false;

            contentWrapper.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;

                isExpanded = !isExpanded;

                if (isExpanded) {
                    textParagraph.classList.remove('line-clamp-2');
                    textParagraph.style.whiteSpace = 'pre-wrap';
                    const formattedText = originalText
                        .replace(/\*\*([^*]+)\*\*/g, '$1')
                        .replace(/\n\n/g, '\n');
                    textParagraph.textContent = formattedText;
                } else {
                    textParagraph.classList.add('line-clamp-2');
                    textParagraph.style.whiteSpace = '';
                    textParagraph.textContent = originalText;
                }
            });

            modified++;
        });

        if (modified > 0) {
            Logger.log(`✓ Bug report expand/collapse enabled for ${modified} report(s)`);
        }
    }
};
