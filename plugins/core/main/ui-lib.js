// ui-lib.js — shared UI tokens, button styles, spinners, and copy feedback.
// Loaded first among core plugins; registers Context.uiLib and Context.buttonFeedback.

const FLEET_UI_STYLE_ID = 'fleet-ui-styles';
const FLEET_UI_SCOPED_STYLE_PREFIX = 'fleet-ui-btn-scope-';

const COPY_SUCCESS_MS = 1000;
const COPY_FAILURE_MS = 500;
const COPY_SUCCESS_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_BG = 'rgb(239, 68, 68)';
const COPY_FLASH_TEXT = '#ffffff';
const SPIN_DURATION = '0.7s';
const TAB_PULSE_MS = 600;

const BTN_VARIANTS = {
    primary: 'wf-dash-btn--primary',
    secondary: 'wf-dash-btn--secondary',
    tertiary: 'wf-dash-btn--basic',
    basic: 'wf-dash-btn--basic'
};

const BTN_SIZES = {
    nav: 'wf-dash-btn--nav',
    regular: 'wf-dash-btn--regular',
    icon: 'wf-dash-btn--icon',
    compact: 'wf-dash-btn--compact'
};

function fleetUiScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_SCOPED_STYLE_PREFIX + slug;
}

function fleetUiBtnBaseCssLines(scopePrefix) {
    const p = scopePrefix ? scopePrefix + ' ' : '';
    const btn = p + '.wf-dash-btn';
    const nav = p + '.wf-dash-btn--nav';
    const regular = p + '.wf-dash-btn--regular';
    const compact = p + '.wf-dash-btn--compact';
    const icon = p + '.wf-dash-btn--icon';
    const full = p + '.wf-dash-btn--full';
    const primary = p + '.wf-dash-btn--primary';
    const secondary = p + '.wf-dash-btn--secondary';
    const tertiary = p + '.wf-dash-btn--basic';
    const headerBasic = p + '.wf-dash-header-btn.wf-dash-btn--basic';

    return [
        btn + ' {',
        '  appearance: none;',
        '  -webkit-appearance: none;',
        '  box-sizing: border-box;',
        '  margin: 0;',
        '  font-family: inherit;',
        '  font-weight: 600;',
        '  border-radius: 6px;',
        '  cursor: pointer;',
        '  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;',
        '  white-space: nowrap;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  line-height: 1.4;',
        '  text-decoration: none;',
        '}',
        nav + ' { padding: 4px 10px; font-size: 11px; }',
        regular + ' { padding: 7px 14px; font-size: 12px; }',
        compact + ' { padding: 2px 10px; font-size: 11px; }',
        icon + ' { width: 26px; height: 26px; padding: 0; font-size: 13px; flex-shrink: 0; }',
        full + ' { width: 100%; box-sizing: border-box; }',
        primary + ' {',
        '  border: 1px solid var(--brand, var(--primary, #2563eb));',
        '  background: var(--brand, var(--primary, #2563eb));',
        '  color: var(--primary-foreground, #ffffff);',
        '}',
        primary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, #2563eb) 88%, #000);',
        '  border-color: color-mix(in srgb, var(--brand, #2563eb) 88%, #000);',
        '  color: var(--primary-foreground, #ffffff);',
        '}',
        secondary + ' {',
        '  border: 1px solid var(--brand, var(--primary, #2563eb));',
        '  background: #000;',
        '  color: #fff;',
        '}',
        secondary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, #2563eb) 10%, var(--background, #fff));',
        '  border-color: var(--brand, var(--primary, #2563eb));',
        '  color: var(--brand, var(--primary, #2563eb));',
        '}',
        tertiary + ' {',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        tertiary + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  border-color: var(--foreground, #0f172a);',
        '  color: var(--foreground, #0f172a);',
        '}',
        primary + ':disabled, ' + secondary + ':disabled {',
        '  cursor: not-allowed;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--muted-foreground, #94a3b8);',
        '  opacity: 0.85;',
        '}',
        tertiary + ':disabled {',
        '  cursor: not-allowed;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--muted-foreground, #94a3b8);',
        '  opacity: 0.85;',
        '}',
        btn + ':disabled[aria-busy="true"] { opacity: 0.65; cursor: wait; }',
        headerBasic + ' { color: var(--muted-foreground, #64748b); }',
        headerBasic + ':hover:not(:disabled) {',
        '  color: var(--foreground, #0f172a);',
        '  border-color: var(--foreground, #0f172a);',
        '}'
    ];
}

function fleetUiGlobalCssText() {
    return [
        '@keyframes fleet-ui-spin { to { transform: rotate(360deg); } }',
        '@keyframes wf-dash-spin { to { transform: rotate(360deg); } }',
        '@keyframes wf-ops-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        '@keyframes fleet-prompt-cache-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        '@keyframes fleet-ui-dots { 0%, 32% { content: \'.\'; } 33%, 65% { content: \'..\'; } 66%, 99% { content: \'...\'; } }',
        '@keyframes wf-dash-dots { 0%, 32% { content: \'.\'; } 33%, 65% { content: \'..\'; } 66%, 99% { content: \'...\'; } }',
        '[data-fleet-ui-dots]::after, [data-wf-dash-dots]::after {',
        '  display: inline;',
        '  content: \'.\';',
        '  animation: fleet-ui-dots 1.5s linear infinite;',
        '}',
        '.fleet-ui-spinner {',
        '  display: inline-block;',
        '  border-radius: 50%;',
        '  border: 2px solid color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 22%, transparent);',
        '  border-top-color: var(--brand, var(--primary, #2563eb));',
        '  animation: fleet-ui-spin ' + SPIN_DURATION + ' linear infinite;',
        '  flex-shrink: 0;',
        '}',
        '@keyframes fleet-ui-tab-pulse {',
        '  0% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_SUCCESS_BG + ' 30%, transparent);',
        '    box-shadow: inset 0 -3px 0 0 ' + COPY_SUCCESS_BG + ';',
        '    color: ' + COPY_SUCCESS_BG + ' !important;',
        '    border-bottom-color: ' + COPY_SUCCESS_BG + ' !important;',
        '  }',
        '  100% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '}',
        '@keyframes dvDiffTabAddPulse {',
        '  0% { background-color: transparent; box-shadow: inset 0 -2px 0 0 transparent; color: inherit; border-bottom-color: inherit; }',
        '  12% { background-color: color-mix(in srgb, ' + COPY_SUCCESS_BG + ' 30%, transparent); box-shadow: inset 0 -3px 0 0 ' + COPY_SUCCESS_BG + '; color: ' + COPY_SUCCESS_BG + ' !important; border-bottom-color: ' + COPY_SUCCESS_BG + ' !important; }',
        '  100% { background-color: transparent; box-shadow: inset 0 -2px 0 0 transparent; color: inherit; border-bottom-color: inherit; }',
        '}',
        '#wf-dash-modal [data-wf-dash-tab].fleet-ui-tab--pulse,',
        '#wf-dash-modal [data-wf-dash-tab].wf-dash-tab--add-pulse {',
        '  animation: fleet-ui-tab-pulse ' + TAB_PULSE_MS + 'ms cubic-bezier(0.22, 1, 0.36, 1) 1;',
        '}'
    ].join('\n');
}

function fleetUiClearCopyFeedback(el) {
    if (!el) return;
    if (el._fleetUiCopyTimeout) {
        clearTimeout(el._fleetUiCopyTimeout);
        el._fleetUiCopyTimeout = null;
    }
    el.style.transition = '';
    el.style.backgroundColor = '';
    el.style.color = '';
    el.style.borderColor = '';
}

function fleetUiFlashSuccess(el, opts) {
    if (!el) return;
    const options = opts || {};
    const restoreStyles = options.restoreStyles !== false;
    fleetUiClearCopyFeedback(el);
    const prevBg = el.style.backgroundColor;
    const prevColor = el.style.color;
    const prevBorder = el.style.borderColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    el.style.backgroundColor = COPY_SUCCESS_BG;
    el.style.color = COPY_FLASH_TEXT;
    if (options.includeBorder) {
        el.style.borderColor = COPY_SUCCESS_BG;
    }
    el._fleetUiCopyTimeout = setTimeout(() => {
        if (restoreStyles) {
            el.style.backgroundColor = prevBg;
            el.style.color = prevColor;
            if (options.includeBorder) el.style.borderColor = prevBorder;
            el.style.transition = prevTransition;
        } else {
            el.style.backgroundColor = '';
            el.style.color = '';
            if (options.includeBorder) el.style.borderColor = '';
            el.style.transition = '';
        }
        el._fleetUiCopyTimeout = null;
    }, options.successMs != null ? options.successMs : COPY_SUCCESS_MS);
}

function fleetUiFlashFailure(el, opts) {
    if (!el) return;
    const options = opts || {};
    const restoreStyles = options.restoreStyles !== false;
    const failureMs = options.failureMs != null ? options.failureMs : COPY_FAILURE_MS;
    fleetUiClearCopyFeedback(el);
    const prevBg = el.style.backgroundColor;
    const prevColor = el.style.color;
    const prevBorder = el.style.borderColor;
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    el.style.backgroundColor = COPY_FAILURE_BG;
    el.style.color = COPY_FLASH_TEXT;
    if (options.includeBorder) {
        el.style.borderColor = COPY_FAILURE_BG;
    }
    void el.offsetWidth;
    const transitionParts = ['background-color ' + failureMs + 'ms ease-out', 'color ' + failureMs + 'ms ease-out'];
    if (options.includeBorder) {
        transitionParts.push('border-color ' + failureMs + 'ms ease-out');
    }
    el.style.transition = transitionParts.join(', ');
    if (restoreStyles) {
        el.style.backgroundColor = prevBg;
        el.style.color = prevColor;
        if (options.includeBorder) el.style.borderColor = prevBorder;
    } else {
        el.style.backgroundColor = '';
        el.style.color = '';
        if (options.includeBorder) el.style.borderColor = '';
    }
    el._fleetUiCopyTimeout = setTimeout(() => {
        el.style.transition = restoreStyles ? (prevTransition || '') : '';
        el._fleetUiCopyTimeout = null;
    }, failureMs);
}

async function fleetUiCopyText(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_e) { /* fall through */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (_e2) {
        return false;
    }
}

async function fleetUiCopyWithFeedback(el, text, opts) {
    const options = opts || {};
    const value = String(text == null ? '' : text).trim();
    if (!value) {
        fleetUiFlashFailure(el, options);
        if (options.logLabel) {
            Logger.warn('ui-lib: copy skipped (empty ' + options.logLabel + ')');
        }
        return false;
    }
    const ok = await fleetUiCopyText(value);
    if (ok) {
        fleetUiFlashSuccess(el, options);
        if (options.logLabel) {
            Logger.log('ui-lib: copied ' + options.logLabel + ' (' + value.length + ' chars)');
        }
    } else {
        fleetUiFlashFailure(el, options);
        if (options.logLabel) {
            Logger.warn('ui-lib: copy ' + options.logLabel + ' failed');
        }
    }
    return ok;
}

function fleetUiBtnClass(variant, size) {
    const v = BTN_VARIANTS[variant] || BTN_VARIANTS.basic;
    const s = BTN_SIZES[size] || BTN_SIZES.nav;
    return 'wf-dash-btn ' + v + ' ' + s;
}

function fleetUiSpinnerHtml(sizePx) {
    const size = sizePx || 16;
    return '<span class="fleet-ui-spinner" aria-hidden="true" style="width: ' + size + 'px; height: ' + size + 'px;"></span>';
}

function fleetUiLoadingDotsAttr() {
    return 'data-fleet-ui-dots';
}

function fleetUiFlashTabSuccess(tabEl) {
    if (!tabEl) return;
    tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    void tabEl.offsetWidth;
    tabEl.classList.add('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    tabEl.addEventListener('animationend', () => {
        tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    }, { once: true });
    Logger.debug('ui-lib: tab pulse');
}

const plugin = {
    id: 'ui-lib',
    name: 'UI Lib',
    description: 'Shared UI tokens, button styles, spinners, and copy feedback',
    _version: '2.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const self = this;

        function ensureStyles() {
            if (document.getElementById(FLEET_UI_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_STYLE_ID;
            style.textContent = fleetUiGlobalCssText();
            (document.head || document.documentElement).appendChild(style);
        }

        function ensureButtonStyles(scopeSelector, appendRoot) {
            if (!scopeSelector) {
                ensureStyles();
                return;
            }
            const styleId = fleetUiScopeStyleId(scopeSelector);
            const root = appendRoot || document;
            if (root.getElementById && root.getElementById(styleId)) return;
            if (root.querySelector && root.querySelector('#' + styleId)) return;
            ensureStyles();
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = fleetUiBtnBaseCssLines(scopeSelector + ' ').join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        ensureStyles();

        Context.uiLib = {
            COPY_SUCCESS_MS,
            COPY_FAILURE_MS,
            COPY_SUCCESS_BG,
            COPY_FAILURE_BG,
            COPY_FLASH_TEXT,
            SPIN_DURATION,
            TAB_PULSE_MS,

            ensureStyles,
            ensureButtonStyles,
            btnClass: fleetUiBtnClass,
            spinnerHtml: fleetUiSpinnerHtml,
            loadingDotsAttr: fleetUiLoadingDotsAttr,

            clearCopyFeedback: fleetUiClearCopyFeedback,
            flashSuccess: fleetUiFlashSuccess,
            flashFailure: fleetUiFlashFailure,
            copyWithFeedback: fleetUiCopyWithFeedback,
            flashTabSuccess: fleetUiFlashTabSuccess
        };

        Context.buttonFeedback = {
            clear: (el) => fleetUiClearCopyFeedback(el),
            flashSuccess: (el, opts) => fleetUiFlashSuccess(el, opts),
            flashFailure: (el, opts) => fleetUiFlashFailure(el, opts)
        };

        if (!self.initialState.registered) {
            Logger.log('ui-lib: module registered (Context.uiLib, Context.buttonFeedback)');
            self.initialState.registered = true;
        }
    }
};
