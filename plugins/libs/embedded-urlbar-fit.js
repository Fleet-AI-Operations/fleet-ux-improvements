// ============= embedded-urlbar-fit.js ============= (library)
const EmbeddedUrlbarFitApi = {
    id: 'compUseRevisionEmbeddedUrlbarFit',
    name: 'Computer Use Revision Embedded URL Bar Fit',
    description:
        'Keeps embedded instance toolbar right-side controls visible by forcing URL segment to shrink/truncate',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, appliedLogged: false, hadToolbarRows: false },

    run(state) {
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


const plugin = {
    id: 'embeddedUrlbarFitLib',
    name: 'Embedded URL Bar Fit (library)',
    description: 'Shared API for embedded instance URL bar truncation',
    _version: '2.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.embeddedUrlbarFit = {
            run: (s, options) => {
                const impl = Object.create(EmbeddedUrlbarFitApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }

                return EmbeddedUrlbarFitApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('embeddedUrlbarFitLib: module registered (Context.embeddedUrlbarFit)');
            state.registered = true;
        }
    }
};
