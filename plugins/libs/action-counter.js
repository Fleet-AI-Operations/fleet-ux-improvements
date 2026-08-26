// ============= action-counter.js (library) =============
// Shared +/- counter chrome and storage. Archetype wrappers supply find/mount.

const COUNTER_MARKER = 'data-fleet-action-counter';
const LEGACY_STORAGE_KEY = 'fleetai_qa_action_counter';

const ActionCounterApi = {
    id: 'compUseActionCounter',
    COUNTER_MARKER,

    storageKeys: {
        count: 'comp-use-action-counter'
    },

    /**
     * @param {object} state
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     * @param {function(): boolean} options.alreadyMounted
     * @param {function(HTMLElement): void} options.mountCounter
     * @param {string} [options.activationDetail] — logged once on first inject
     */
    run(state, options) {
        const opts = options || {};
        const logTag = opts.logTag || this.id;
        const alreadyMounted = opts.alreadyMounted;
        const mountCounter = opts.mountCounter;

        if (typeof alreadyMounted !== 'function' || typeof mountCounter !== 'function') {
            return;
        }

        if (alreadyMounted()) {
            return;
        }

        document.querySelectorAll(`[${COUNTER_MARKER}="true"]`).forEach((el) => el.remove());
        const counter = this.buildCounter(state);
        mountCounter(counter);

        if (!state.activationLogged) {
            const detail = opts.activationDetail || 'counter injected';
            Logger.log(`${detail} (count=${this.getCount()})`);
            state.activationLogged = true;
        }
    },

    migrateLegacyCount(state) {
        if (state.migratedLegacy) return;
        state.migratedLegacy = true;
        const current = Storage.get(this.storageKeys.count, null);
        if (current !== null && current !== undefined && current !== '') return;
        try {
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy === null || legacy === '') return;
            const parsed = parseInt(legacy, 10);
            if (Number.isNaN(parsed)) return;
            Storage.set(this.storageKeys.count, this.clampCount(parsed));
            Logger.log(`migrated legacy count ${parsed} from standalone script`);
        } catch (error) {
            Logger.warn(`legacy count migration failed`, error);
        }
    },

    clampCount(val) {
        const parsed = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
        return Math.max(0, Math.trunc(parsed));
    },

    getCount() {
        const raw = Storage.get(this.storageKeys.count, 0);
        const parsed = parseInt(raw, 10);
        return this.clampCount(Number.isNaN(parsed) ? 0 : parsed);
    },

    setCount(val, reason) {
        const prev = this.getCount();
        const next = this.clampCount(val);
        Storage.set(this.storageKeys.count, next);
        if (reason && prev !== next) {
            Logger.log(`count ${prev}→${next} (${reason})`);
        }
        return next;
    },

    countColor() {
        return 'var(--foreground, #111)';
    },

    applyCountDisplay(input, val) {
        input.value = String(val);
        input.style.color = this.countColor(val);
    },

    makeBtn(label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        const base = (Context.uiLib && typeof Context.uiLib.btnClass === 'function')
            ? Context.uiLib.btnClass('basic', 'compact')
            : 'wf-dash-btn wf-dash-btn--basic wf-dash-btn--compact';
        btn.className = base;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onClick();
        });
        return btn;
    },

    parseInputValue(text) {
        const trimmed = (text || '').trim();
        if (trimmed === '' || trimmed === '-') return 0;
        const parsed = parseInt(trimmed, 10);
        return this.clampCount(Number.isNaN(parsed) ? 0 : parsed);
    },

    buildCounter(state) {
        this.migrateLegacyCount(state);

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles('[data-fleet-action-counter="true"]');
        }

        const counter = document.createElement('div');
        counter.setAttribute(COUNTER_MARKER, 'true');
        counter.setAttribute('data-fleet-plugin', this.id);
        counter.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 0 4px;
            font-family: inherit;
            user-select: none;
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.title = 'Click to edit count';
        input.style.cssText = `
            min-width: 26px;
            width: 36px;
            text-align: center;
            font-weight: 700;
            font-size: 14px;
            color: var(--foreground, #111);
            border: 1px solid transparent;
            border-radius: 4px;
            background: transparent;
            padding: 0 2px;
            line-height: 1.2;
            font-family: inherit;
        `;

        let editStartValue = this.getCount();
        this.applyCountDisplay(input, editStartValue);

        const commitEdit = (reason) => {
            const next = this.setCount(this.parseInputValue(input.value), reason);
            this.applyCountDisplay(input, next);
            editStartValue = next;
        };

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('focus', () => {
            editStartValue = this.getCount();
            input.select();
            input.style.borderColor = 'var(--border, #e2e8f0)';
            input.style.background = 'var(--background, #fff)';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = 'transparent';
            input.style.background = 'transparent';
            commitEdit('manual edit');
        });
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.applyCountDisplay(input, editStartValue);
                input.blur();
            }
        });

        const btnMinus = this.makeBtn(
            '−',
            'Subtract 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() - 1, '−'))
        );
        const btnPlus = this.makeBtn(
            '+',
            'Add 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() + 1, '+'))
        );

        counter.append(btnMinus, input, btnPlus);
        return counter;
    }
};

const plugin = {
    id: 'actionCounterLib',
    name: 'Action Counter (library)',
    description:
        'Shared Action Counter UI and storage',
    _version: '3.7',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.actionCounter = {
            COUNTER_MARKER,
            run: (s, options) => {
                const impl = Object.create(ActionCounterApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return ActionCounterApi.run.call(impl, s, options);
            },
            buildCounter: (s, options) => {
                const impl = Object.create(ActionCounterApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return ActionCounterApi.buildCounter.call(impl, s);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.actionCounter)');
            state.registered = true;
        }
    }
};
