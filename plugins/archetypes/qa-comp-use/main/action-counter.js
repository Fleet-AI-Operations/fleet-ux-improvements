// ============= action-counter.js =============
// Persistent +/- counter beside the Verifier tab; click the number to type a value.

const COUNTER_MARKER = 'data-fleet-action-counter';
const LEGACY_STORAGE_KEY = 'fleetai_qa_action_counter';

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description: 'Persistent +/- counter beside the Verifier tab; click the number to type a value',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        count: 'comp-use-action-counter'
    },

    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        migratedLegacy: false
    },

    onMutation(state) {
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        if (!taskCard) {
            if (state.hadAnchor) {
                Logger.debug(`${this.id}: task card left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: [data-ui="qa-task-card"] not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        const verifierTab = this.findVerifierTab();
        if (!verifierTab) {
            if (state.hadAnchor) {
                Logger.debug(`${this.id}: verifier tab left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`${this.id}: verifier tab not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        if (verifierTab.nextElementSibling &&
            verifierTab.nextElementSibling.getAttribute(COUNTER_MARKER) === 'true') {
            return;
        }

        document.querySelectorAll(`[${COUNTER_MARKER}="true"]`).forEach((el) => el.remove());
        verifierTab.insertAdjacentElement('afterend', this.buildCounter(state));

        if (!state.activationLogged) {
            Logger.log(`${this.id}: counter injected beside Verifier tab (count=${this.getCount()})`);
            state.activationLogged = true;
        }
    },

    findVerifierTab() {
        const byUi = document.querySelector('[data-ui="qa-verifier-tab"]');
        if (byUi) return byUi;
        return document.querySelector('button[role="tab"][aria-controls*="verifier-output"]');
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
            Storage.set(this.storageKeys.count, parsed);
            Logger.log(`${this.id}: migrated legacy count ${parsed} from standalone script`);
        } catch (error) {
            Logger.warn(`${this.id}: legacy count migration failed`, error);
        }
    },

    getCount() {
        const raw = Storage.get(this.storageKeys.count, 0);
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
    },

    setCount(val, reason) {
        const prev = this.getCount();
        const next = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
        Storage.set(this.storageKeys.count, next);
        if (reason && prev !== next) {
            Logger.log(`${this.id}: count ${prev}→${next} (${reason})`);
        }
        return next;
    },

    countColor(val) {
        if (val > 0) return '#059669';
        if (val < 0) return '#dc2626';
        return 'var(--foreground, #111)';
    },

    applyCountDisplay(input, val) {
        input.value = String(val);
        input.style.color = this.countColor(val);
    },

    makeBtn(label, title, onClick, extraStyle) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 5px;
            border: 1px solid var(--border, #e2e8f0);
            background: var(--accent, #f1f5f9);
            color: var(--foreground, #111);
            font-weight: 700;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            transition: background 0.15s;
            ${extraStyle || ''}
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--accent-foreground, #d4d8de)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'var(--accent, #f1f5f9)';
        });
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
        return Number.isNaN(parsed) ? 0 : parsed;
    },

    buildCounter(state) {
        this.migrateLegacyCount(state);

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

        const btnPlus = this.makeBtn(
            '+',
            'Add 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() + 1, '+')),
            'width: 40px; height: 22px; font-size: 18px;'
        );
        const btnMinus = this.makeBtn(
            '−',
            'Subtract 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() - 1, '−')),
            'width: 40px; height: 22px; font-size: 18px;'
        );
        const btnReset = this.makeBtn(
            '↺',
            'Reset to 0',
            () => this.applyCountDisplay(input, this.setCount(0, 'reset')),
            'width: 20px; height: 20px; font-size: 13px; color: #888;'
        );

        counter.append(btnReset, input, btnMinus, btnPlus);
        return counter;
    }
};
