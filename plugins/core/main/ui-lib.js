// ui-lib.js — shared UI tokens, button styles, spinners, and copy feedback.
// Loaded first among core plugins; registers Context.uiLib and Context.buttonFeedback.

const FLEET_UI_STYLE_ID = 'fleet-ui-styles';
const FLEET_UI_SCOPED_STYLE_PREFIX = 'fleet-ui-btn-scope-';
const FLEET_UI_USER_STORY_PROSE_STYLE_ID = 'fleet-ui-user-story-prose';

const FLASH_PULSE_MS = 600;
const FLASH_PULSE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const COPY_SUCCESS_MS = FLASH_PULSE_MS;
const COPY_FAILURE_MS = FLASH_PULSE_MS;
const COPY_SUCCESS_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_BG = 'rgb(239, 68, 68)';
const SPIN_DURATION = '0.7s';
const TAB_PULSE_MS = FLASH_PULSE_MS;
const FLASH_CLASS_SUCCESS = 'fleet-ui-flash--success';
const FLASH_CLASS_FAILURE = 'fleet-ui-flash--failure';

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
        '  color: #ffffff;',
        '}',
        secondary + ' {',
        '  border: 1px solid var(--brand, var(--primary, #2563eb));',
        '  background: #000;',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        secondary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, #2563eb) 10%, var(--background, #fff));',
        '  border-color: var(--brand, var(--primary, #2563eb));',
        '  color: #ffffff;',
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
        '@keyframes fleet-ui-flash-success {',
        '  0% { background-color: transparent; color: inherit; border-color: inherit; }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_SUCCESS_BG + ' 30%, transparent);',
        '    color: ' + COPY_SUCCESS_BG + ' !important;',
        '    border-color: ' + COPY_SUCCESS_BG + ' !important;',
        '  }',
        '  100% { background-color: transparent; color: inherit; border-color: inherit; }',
        '}',
        '@keyframes fleet-ui-flash-failure {',
        '  0% { background-color: transparent; color: inherit; border-color: inherit; }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_FAILURE_BG + ' 30%, transparent);',
        '    color: ' + COPY_FAILURE_BG + ' !important;',
        '    border-color: ' + COPY_FAILURE_BG + ' !important;',
        '  }',
        '  100% { background-color: transparent; color: inherit; border-color: inherit; }',
        '}',
        '#wf-dash-modal [data-wf-dash-tab].fleet-ui-tab--pulse,',
        '#wf-dash-modal [data-wf-dash-tab].wf-dash-tab--add-pulse {',
        '  animation: fleet-ui-tab-pulse ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}',
        '.' + FLASH_CLASS_SUCCESS + ' {',
        '  animation: fleet-ui-flash-success ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}',
        '.' + FLASH_CLASS_FAILURE + ' {',
        '  animation: fleet-ui-flash-failure ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}'
    ].join('\n');
}

function fleetUiClearCopyFeedback(el) {
    if (!el) return;
    if (el._fleetUiCopyTimeout) {
        clearTimeout(el._fleetUiCopyTimeout);
        el._fleetUiCopyTimeout = null;
    }
    if (el._fleetUiFlashEndHandler) {
        el.removeEventListener('animationend', el._fleetUiFlashEndHandler);
        el._fleetUiFlashEndHandler = null;
    }
    el.classList.remove(FLASH_CLASS_SUCCESS, FLASH_CLASS_FAILURE);
    el.style.transition = '';
    el.style.backgroundColor = '';
    el.style.color = '';
    el.style.borderColor = '';
}

function fleetUiFinishPulseFlash(el, className) {
    if (!el) return;
    if (el._fleetUiCopyTimeout) {
        clearTimeout(el._fleetUiCopyTimeout);
        el._fleetUiCopyTimeout = null;
    }
    if (el._fleetUiFlashEndHandler) {
        el.removeEventListener('animationend', el._fleetUiFlashEndHandler);
        el._fleetUiFlashEndHandler = null;
    }
    el.classList.remove(className);
}

function fleetUiRunPulseFlash(el, kind, opts) {
    if (!el) return;
    const options = opts || {};
    const isFailure = kind === 'failure';
    const durationMs = isFailure
        ? (options.failureMs != null ? options.failureMs : COPY_FAILURE_MS)
        : (options.successMs != null ? options.successMs : COPY_SUCCESS_MS);
    const className = isFailure ? FLASH_CLASS_FAILURE : FLASH_CLASS_SUCCESS;
    fleetUiClearCopyFeedback(el);
    void el.offsetWidth;
    el.classList.add(className);
    const finish = () => fleetUiFinishPulseFlash(el, className);
    el._fleetUiFlashEndHandler = (e) => {
        if (e.target !== el) return;
        finish();
    };
    el.addEventListener('animationend', el._fleetUiFlashEndHandler);
    el._fleetUiCopyTimeout = setTimeout(finish, durationMs + 100);
}

function fleetUiFlashSuccess(el, opts) {
    fleetUiRunPulseFlash(el, 'success', opts);
}

function fleetUiFlashFailure(el, opts) {
    fleetUiRunPulseFlash(el, 'failure', opts);
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

function fleetUiUserStoryProseCssText() {
    const p = '[data-fleet-user-story-prose]';
    return [
        p + ' {',
        '  font-size: 0.875rem;',
        '  line-height: 1.5;',
        '  color: inherit;',
        '}',
        p + ' > :first-child { margin-top: 0; }',
        p + ' > :last-child { margin-bottom: 0; }',
        p + ' p { margin: 0.4em 0; }',
        p + ' h1, ' + p + ' h2, ' + p + ' h3, ' + p + ' h4, ' + p + ' h5 {',
        '  font-weight: 600;',
        '  line-height: 1.35;',
        '  color: inherit;',
        '  margin: 0.75em 0 0.35em;',
        '}',
        p + ' h1 { font-size: 1.15em; }',
        p + ' h2 { font-size: 1.08em; }',
        p + ' h3 { font-size: 1.02em; }',
        p + ' h4, ' + p + ' h5 { font-size: 1em; }',
        p + ' ul {',
        '  margin: 0.4em 0;',
        '  padding-left: 1.35em;',
        '  list-style-type: disc;',
        '}',
        p + ' li {',
        '  margin: 0.15em 0;',
        '  display: list-item;',
        '}',
        p + ' strong { font-weight: 700; color: inherit; }',
        p + ' code {',
        '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
        '  font-size: 0.92em;',
        '  padding: 0.1em 0.3em;',
        '  border-radius: 0.25rem;',
        '  background: color-mix(in srgb, currentColor 10%, transparent);',
        '}',
        p + ' a {',
        '  color: var(--brand, #2563eb);',
        '  text-decoration: underline;',
        '  text-underline-offset: 2px;',
        '}'
    ].join('\n');
}

const plugin = {
    id: 'ui-lib',
    name: 'UI Lib',
    description: 'Shared UI tokens, button styles, spinners, and copy feedback',
    _version: '2.5',
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

        function ensureUserStoryMarkdownStyles() {
            ensureStyles();
            if (document.getElementById(FLEET_UI_USER_STORY_PROSE_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_USER_STORY_PROSE_STYLE_ID;
            style.textContent = fleetUiUserStoryProseCssText();
            (document.head || document.documentElement).appendChild(style);
            if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
                CleanupRegistry.registerElement(style);
            }
        }

        ensureStyles();

        Context.uiLib = {
            FLASH_PULSE_MS,
            FLASH_PULSE_EASING,
            COPY_SUCCESS_MS,
            COPY_FAILURE_MS,
            COPY_SUCCESS_BG,
            COPY_FAILURE_BG,
            SPIN_DURATION,
            TAB_PULSE_MS,

            ensureStyles,
            ensureButtonStyles,
            ensureUserStoryMarkdownStyles,
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
