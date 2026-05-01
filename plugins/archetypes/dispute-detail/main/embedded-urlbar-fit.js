// ============= embedded-urlbar-fit.js =============
const plugin = {
    id: 'disputeDetailEmbeddedUrlbarFit',
    name: 'Dispute Detail Embedded URL Bar Fit',
    description:
        'Keeps embedded instance toolbar right-side controls visible by forcing URL segment to shrink/truncate',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, appliedLogged: false },

    onMutation(state) {
        const rows = Context.dom.queryAll('div.flex.items-center.gap-1.p-1.border-b.h-10.bg-background', {
            context: `${this.id}.toolbarRows`
        });

        if (rows.length === 0) {
            if (!state.missingLogged) {
                Logger.debug('Dispute Detail embedded URL bar fit: no embedded toolbar rows found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        let fixedThisPass = 0;

        rows.forEach((row) => {
            const rowText = row.textContent || '';
            if (!rowText.includes('Remote Copy') || !rowText.includes('Remote Paste')) return;

            const directGroups = Array.from(row.children).filter(
                (el) => el.tagName === 'DIV' && el.classList.contains('flex') && el.classList.contains('items-center')
            );
            if (directGroups.length < 3) return;

            const middleGroup = directGroups[1];
            const rightGroup = directGroups[2];

            middleGroup.classList.add('min-w-0');
            middleGroup.classList.add('overflow-hidden');
            rightGroup.classList.add('shrink-0');

            const urlPill = middleGroup.querySelector(':scope > div.flex-1');
            if (urlPill) {
                urlPill.classList.add('min-w-0');
            }

            const urlButton = middleGroup.querySelector('button.w-full');
            if (urlButton) {
                urlButton.classList.add('min-w-0');
            }

            fixedThisPass++;
        });

        if (fixedThisPass > 0 && !state.appliedLogged) {
            Logger.log(`Dispute Detail embedded URL bar fit: adjusted ${fixedThisPass} toolbar row(s) this pass`);
            state.appliedLogged = true;
        }
    }
};
