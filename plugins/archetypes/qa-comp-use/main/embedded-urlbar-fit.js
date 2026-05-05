// ============= embedded-urlbar-fit.js =============
const plugin = {
    id: 'qaCompUseEmbeddedUrlbarFit',
    name: 'QA Computer Use Embedded URL Bar Fit',
    description:
        'Keeps embedded instance toolbar right-side controls visible by forcing URL segment to shrink/truncate',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, appliedLogged: false, hadToolbarRows: false },

    onMutation(state) {
        const rows = Context.dom.queryAll('div.flex.items-center.gap-1.p-1.border-b.h-10.bg-background', {
            context: `${this.id}.toolbarRows`
        });

        if (rows.length === 0) {
            if (state.hadToolbarRows) {
                Logger.debug(`${this.id}: embedded toolbar rows left DOM — truncation inactive`);
                state.hadToolbarRows = false;
                state.appliedLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: no embedded toolbar rows found yet`);
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;
        state.hadToolbarRows = true;

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
            Logger.log(`${this.id}: URL bar truncation active (${fixedThisPass} matching row(s) adjusted)`);
            state.appliedLogged = true;
        }
    }
};
