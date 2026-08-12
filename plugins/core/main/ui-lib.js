// ui-lib.js — shared UI tokens, button styles, spinners, and copy feedback.
// Loaded first among core plugins; registers Context.uiLib and Context.buttonFeedback.

const FLEET_UI_STYLE_ID = 'fleet-ui-styles';
const FLEET_UI_SCOPED_STYLE_PREFIX = 'fleet-ui-btn-scope-';
const FLEET_UI_PANEL_STYLE_ID = 'fleet-ui-panel-styles';
const FLEET_UI_PANEL_SCOPED_PREFIX = 'fleet-ui-panel-scope-';
const FLEET_UI_SEGMENT_STYLE_ID = 'fleet-ui-segment-styles';
const FLEET_UI_SEGMENT_SCOPED_PREFIX = 'fleet-ui-seg-scope-';
const FLEET_UI_FILTER_TOGGLE_STYLE_ID = 'fleet-ui-filter-toggle-styles';
const FLEET_UI_FILTER_TOGGLE_SCOPED_PREFIX = 'fleet-ui-ft-scope-';
const FLEET_UI_ALERT_BANNER_STYLE_ID = 'fleet-ui-alert-banner-styles';
const FLEET_UI_USER_STORY_PROSE_STYLE_ID = 'fleet-ui-user-story-prose';
const FLEET_UI_THEME_OVERRIDE_STYLE_ID = 'fleet-ui-theme-overrides';
const FLEET_UI_THEME_MODE_KEY = 'extension-theme-mode';
const FLEET_UI_THEME_MODES = ['match', 'light', 'dark'];
/** Shared accent for Preferred chrome (segments, primary buttons, brand-tinted controls). */
const FLEET_UI_ACCENT = '#2563eb';
const FLEET_UI_ACCENT_FG = '#ffffff';

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

/** Panel kit class names (theme-aware floating chrome). */
const PANEL_CLASSES = {
    root: 'fleet-ui-panel',
    header: 'fleet-ui-panel__header',
    title: 'fleet-ui-panel__title',
    sectionLabel: 'fleet-ui-panel__section-label',
    muted: 'fleet-ui-panel__muted',
    strong: 'fleet-ui-panel__strong',
    btn: 'fleet-ui-panel__btn',
    textarea: 'fleet-ui-panel__textarea',
    chip: 'fleet-ui-panel__chip',
    chipSep: 'fleet-ui-panel__chip-sep',
    toast: 'fleet-ui-panel__toast',
    resize: 'fleet-ui-panel__resize',
    divider: 'fleet-ui-panel__divider',
    ghostBtn: 'fleet-ui-panel__ghost-btn'
};

/**
 * Preferred-mode alert banners (session refresh, update notice, ops credential gaps).
 * Variants: danger (red), amber, amberSoft.
 */
const ALERT_BANNER_CLASSES = {
    root: 'fleet-ui-alert-banner',
    danger: 'fleet-ui-alert-banner--danger',
    amber: 'fleet-ui-alert-banner--amber',
    amberSoft: 'fleet-ui-alert-banner--amber-soft',
    title: 'fleet-ui-alert-banner__title',
    body: 'fleet-ui-alert-banner__body',
    footer: 'fleet-ui-alert-banner__footer',
    btnSecondary: 'fleet-ui-alert-banner__btn-secondary',
    btnPrimary: 'fleet-ui-alert-banner__btn-primary'
};

/** Exclusive connected segment control (Match/Light/Dark, Diff Viewer On/Off, Clear/Add). */
const SEGMENT_CLASSES = {
    group: 'fleet-ui-seg-group',
    groupFill: 'fleet-ui-seg-group--fill',
    btn: 'fleet-ui-seg-btn',
    btnDivider: 'fleet-ui-seg-btn--divider'
};

/** Multi-select filter pills (Ops Dashboard Task Creation / QA / …). */
const FILTER_TOGGLE_CLASSES = {
    btn: 'fleet-ui-filter-toggle'
};

let _fleetThemeListeners = [];
let _fleetThemeObserverStarted = false;
let _fleetLastDark = null;

const BTN_VARIANTS = {
    primary: 'wf-dash-btn--primary',
    secondary: 'wf-dash-btn--secondary',
    tertiary: 'wf-dash-btn--basic',
    basic: 'wf-dash-btn--basic',
    danger: 'wf-dash-btn--danger',
    success: 'wf-dash-btn--success',
    warning: 'wf-dash-btn--warning'
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

function fleetUiPanelScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_PANEL_SCOPED_PREFIX + slug;
}

function fleetUiSegmentScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_SEGMENT_SCOPED_PREFIX + slug;
}

function fleetUiFilterToggleScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_FILTER_TOGGLE_SCOPED_PREFIX + slug;
}

function fleetUiSiteIsDark() {
    return document.documentElement.classList.contains('dark');
}

function fleetUiNormalizeThemeMode(mode) {
    const m = String(mode || '').toLowerCase();
    return FLEET_UI_THEME_MODES.includes(m) ? m : 'match';
}

function fleetUiGetThemeMode() {
    try {
        if (typeof Storage !== 'undefined' && Storage.get) {
            return fleetUiNormalizeThemeMode(Storage.get(FLEET_UI_THEME_MODE_KEY, 'match'));
        }
    } catch (_) { /* ignore */ }
    return 'match';
}

function fleetUiResolveTheme() {
    const mode = fleetUiGetThemeMode();
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return fleetUiSiteIsDark() ? 'dark' : 'light';
}

function fleetUiIsFleetDark() {
    return fleetUiResolveTheme() === 'dark';
}

function fleetUiGetFleetTheme() {
    return fleetUiResolveTheme();
}

/** Opaque Preferred-mode palette for Settings / injected chrome (not host CSS vars). */
function fleetUiChromeColors() {
    if (fleetUiIsFleetDark()) {
        return {
            bg: '#18181b',
            card: '#27272a',
            // Match Ops modal/gutter bg so task cards align with the shell T-shape.
            taskCard: '#18181b',
            hover: '#3f3f46',
            border: '#3f3f46',
            borderHover: '#52525b',
            fg: '#e4e4e7',
            muted: '#a1a1aa'
        };
    }
    return {
        bg: '#ffffff',
        card: '#fafafa',
        // Match Ops modal/gutter bg so task cards align with the shell T-shape.
        taskCard: '#ffffff',
        hover: '#f0f0f0',
        border: '#e5e5e5',
        borderHover: '#d1d5db',
        fg: '#333333',
        muted: '#666666'
    };
}

function fleetUiThemeChromeRootsSelector() {
    return [
        '.fleet-ui-panel',
        '.fleet-ui-panel__chip',
        '.fleet-ui-panel__toast',
        '#wf-settings-modal',
        '#wf-dash-modal',
        '#wf-dev-log-panel',
        '#wf-dev-log-toggle',
        '#fleet-vnc-helper',
        '#fleet-vnc-helper-tab',
        '#fleet-env-helper',
        '#fleet-env-helper-tab'
    ].join(', ');
}

function fleetUiThemeOverrideCssText() {
    const roots = fleetUiThemeChromeRootsSelector();
    const rootsAndDescendants = roots
        .split(', ')
        .flatMap((sel) => [sel, sel + ' *'])
        .join(', ');
    return [
        // Preferred light tokens match Settings chromeColors() light palette.
        'html[data-fleet-ux-theme="light"] ' + rootsAndDescendants + ' {',
        '  --background: #ffffff !important;',
        '  --card: #fafafa !important;',
        '  --foreground: #333333 !important;',
        '  --border: #e5e5e5 !important;',
        '  --muted: #f0f0f0 !important;',
        '  --muted-foreground: #666666 !important;',
        '  --input: #e5e5e5 !important;',
        // Keep filled controls on the extension accent (not host indigo/--primary-foreground).
        '  --brand: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary-foreground: ' + FLEET_UI_ACCENT_FG + ' !important;',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + rootsAndDescendants + ' {',
        '  --background: #121212 !important;',
        '  --card: #1a1a1c !important;',
        '  --foreground: #f5f5f5 !important;',
        '  --border: #262626 !important;',
        '  --muted: #171717 !important;',
        '  --muted-foreground: #8c8c8c !important;',
        '  --input: #262626 !important;',
        '  --brand: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary-foreground: ' + FLEET_UI_ACCENT_FG + ' !important;',
        '}'
    ].join('\n');
}

function fleetUiEnsureThemeOverrideStyles() {
    let style = document.getElementById(FLEET_UI_THEME_OVERRIDE_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = FLEET_UI_THEME_OVERRIDE_STYLE_ID;
    }
    style.textContent = fleetUiThemeOverrideCssText();
    // Keep after site CSS so Preferred tokens win cascade order as well as specificity.
    (document.head || document.documentElement).appendChild(style);
}

function fleetUiSyncThemeDataset(forceNotify) {
    const theme = fleetUiResolveTheme();
    const dark = theme === 'dark';
    try {
        document.documentElement.dataset.fleetUxTheme = theme;
    } catch (_) { /* ignore */ }
    fleetUiEnsureThemeOverrideStyles();
    if (forceNotify || _fleetLastDark !== dark) {
        _fleetLastDark = dark;
        const payload = { theme, dark };
        for (const fn of _fleetThemeListeners) {
            try {
                fn(payload);
            } catch (err) {
                Logger.warn('theme listener failed', err);
            }
        }
    }
}

function fleetUiSetThemeMode(mode) {
    const next = fleetUiNormalizeThemeMode(mode);
    try {
        if (typeof Storage !== 'undefined' && Storage.set) {
            Storage.set(FLEET_UI_THEME_MODE_KEY, next);
        }
    } catch (err) {
        Logger.warn('failed to persist theme mode', err);
    }
    fleetUiSyncThemeDataset(true);
    Logger.log('preferred mode → ' + next);
    return next;
}

function fleetUiNotifyThemeChange() {
    fleetUiSyncThemeDataset(false);
}

function fleetUiEnsureThemeObserver() {
    if (_fleetThemeObserverStarted) return;
    _fleetThemeObserverStarted = true;
    fleetUiSyncThemeDataset(true);
    try {
        const observer = new MutationObserver(() => {
            if (fleetUiGetThemeMode() !== 'match') return;
            fleetUiNotifyThemeChange();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
    } catch (err) {
        Logger.warn('fleet theme observer failed', err);
    }
}

function fleetUiOnThemeChange(callback) {
    if (typeof callback !== 'function') return () => {};
    fleetUiEnsureThemeObserver();
    _fleetThemeListeners.push(callback);
    return () => {
        _fleetThemeListeners = _fleetThemeListeners.filter((fn) => fn !== callback);
    };
}

function fleetUiPanelCssLines(scopePrefix) {
    const p = scopePrefix || '';
    const root = p + '.fleet-ui-panel';
    const header = p + '.fleet-ui-panel__header';
    const title = p + '.fleet-ui-panel__title';
    const sectionLabel = p + '.fleet-ui-panel__section-label';
    const muted = p + '.fleet-ui-panel__muted';
    const strong = p + '.fleet-ui-panel__strong';
    const btn = p + '.fleet-ui-panel__btn';
    const textarea = p + '.fleet-ui-panel__textarea';
    const chip = p + '.fleet-ui-panel__chip';
    const chipSep = p + '.fleet-ui-panel__chip-sep';
    const toast = p + '.fleet-ui-panel__toast';
    const resize = p + '.fleet-ui-panel__resize';
    const divider = p + '.fleet-ui-panel__divider';
    const ghostBtn = p + '.fleet-ui-panel__ghost-btn';

    return [
        root + ' {',
        '  color: var(--foreground, #0f172a);',
        '  background: var(--card, var(--background, #ffffff));',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 10px;',
        '  box-shadow: 0 12px 40px color-mix(in srgb, var(--foreground, #0f172a) 18%, transparent);',
        '  overflow: hidden;',
        '  font: 13px/1.45 system-ui, Segoe UI, sans-serif;',
        '}',
        header + ' {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 8px;',
        '  padding: 8px 10px 8px 12px;',
        '  font-weight: 600;',
        '  font-size: 12px;',
        '  letter-spacing: 0.02em;',
        '  color: var(--foreground, #0f172a);',
        '  background: color-mix(in srgb, var(--muted, #f1f5f9) 80%, transparent);',
        '  border-bottom: 1px solid var(--border, #e2e8f0);',
        '  flex-shrink: 0;',
        '}',
        title + ' {',
        '  flex: 1;',
        '  min-width: 0;',
        '  font-weight: 600;',
        '  font-size: 12px;',
        '}',
        sectionLabel + ' {',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  color: var(--muted-foreground, #64748b);',
        '  letter-spacing: 0.03em;',
        '  text-transform: uppercase;',
        '  user-select: none;',
        '}',
        muted + ' {',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        strong + ' {',
        '  color: var(--foreground, #0f172a);',
        '  font-weight: 600;',
        '}',
        btn + ' {',
        '  margin: 0;',
        '  padding: 6px 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  font: inherit;',
        '  font-size: 11px;',
        '  font-weight: 500;',
        '  cursor: pointer;',
        '  transition: background 0.15s, border-color 0.15s, color 0.15s;',
        '}',
        btn + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  border-color: var(--foreground, #0f172a);',
        '}',
        textarea + ' {',
        '  box-sizing: border-box;',
        '  width: 100%;',
        '  padding: 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  font: inherit;',
        '  resize: vertical;',
        '  overflow-y: auto;',
        '}',
        chip + ' {',
        '  display: flex;',
        '  align-items: stretch;',
        '  padding: 0;',
        '  font-size: 12px;',
        '  border-radius: 10px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--card, var(--background, #fff));',
        '  color: var(--foreground, #0f172a);',
        '  box-shadow: 0 6px 18px color-mix(in srgb, var(--foreground, #0f172a) 14%, transparent);',
        '  overflow: hidden;',
        '}',
        chip + ' button {',
        '  margin: 0;',
        '  padding: 6px 10px;',
        '  border: none;',
        '  background: transparent;',
        '  color: inherit;',
        '  font: inherit;',
        '  font-size: 12px;',
        '  cursor: pointer;',
        '}',
        chipSep + ' {',
        '  border-left: 1px solid var(--border, #e2e8f0) !important;',
        '  padding: 6px 8px !important;',
        '  font-size: 13px !important;',
        '  line-height: 1 !important;',
        '}',
        toast + ' {',
        '  background: var(--card, var(--background, #fff));',
        '  color: var(--foreground, #0f172a);',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  font: 12px/1.4 system-ui, Segoe UI, sans-serif;',
        '  padding: 10px 12px;',
        '  border-radius: 8px;',
        '  box-shadow: 0 4px 16px color-mix(in srgb, var(--foreground, #0f172a) 16%, transparent);',
        '  max-width: min(420px, 92vw);',
        '  word-break: break-word;',
        '  white-space: pre-wrap;',
        '}',
        resize + ' {',
        '  position: absolute;',
        '  right: 2px;',
        '  bottom: 2px;',
        '  width: 14px;',
        '  height: 14px;',
        '  cursor: se-resize;',
        '  background: transparent;',
        '  border-right: 2px solid var(--muted-foreground, #94a3b8);',
        '  border-bottom: 2px solid var(--muted-foreground, #94a3b8);',
        '  border-radius: 0 0 8px 0;',
        '  z-index: 1;',
        '}',
        divider + ' {',
        '  border-top: 1px solid var(--border, #e2e8f0);',
        '}',
        ghostBtn + ' {',
        '  margin: 0;',
        '  padding: 2px 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: transparent;',
        '  color: var(--muted-foreground, #64748b);',
        '  font: inherit;',
        '  font-size: 10px;',
        '  font-weight: 500;',
        '  cursor: pointer;',
        '}',
        ghostBtn + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--foreground, #0f172a);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + root + ' {',
        '  background: color-mix(in srgb, var(--card, #1a1a1c) 82%, #fff);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + header + ' {',
        '  background: color-mix(in srgb, var(--foreground, #f5f5f5) 8%, transparent);',
        '  border-bottom-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + chip + ' {',
        '  background: color-mix(in srgb, var(--card, #1a1a1c) 82%, #fff);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + toast + ' {',
        '  background: color-mix(in srgb, var(--card, #1a1a1c) 82%, #fff);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + btn + ',',
        'html[data-fleet-ux-theme="dark"] ' + textarea + ' {',
        '  background: var(--background, #121212);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '}',
        p + '.fleet-ui-log--error { color: #dc2626; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--error { color: #fca5a5; }',
        p + '.fleet-ui-log--warn { color: #ca8a04; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--warn { color: #facc15; }',
        p + '.fleet-ui-log--debug { color: #2563eb; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--debug { color: #93c5fd; }',
        p + '.fleet-ui-log--info { color: #059669; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--info { color: #6ee7b7; }',
        p + '.fleet-ui-log-entry:hover {',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 6%, transparent);',
        '}'
    ];
}

function fleetUiAlertBannerCssLines() {
    const root = '.fleet-ui-alert-banner';
    const danger = root + '--danger';
    const amber = root + '--amber';
    const amberSoft = root + '--amber-soft';
    const title = root + '__title';
    const body = root + '__body';
    const footer = root + '__footer';
    const btnSec = root + '__btn-secondary';
    const btnPri = root + '__btn-primary';
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;
    return [
        danger + ' {',
        '  margin-bottom: 4px; padding: 14px; padding-top: 20px;',
        '  background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px;',
        '}',
        danger + ' ' + title + ',',
        danger + ' ' + body + ',',
        danger + ' ' + body + ' a { color: #991b1b; }',
        danger + ' ' + body + ' a { text-decoration: underline; font-weight: 600; }',
        danger + ' ' + footer + ' {',
        '  margin-top: 12px; padding-top: 10px; border-top: 1px solid #fecaca;',
        '  text-align: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;',
        '}',
        danger + ' ' + btnSec + ',',
        danger + ' ' + btnPri + ' {',
        '  display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600;',
        '  border-radius: 6px; cursor: pointer; border: 1px solid #dc2626;',
        '  text-decoration: none;',
        '}',
        danger + ' ' + btnSec + ' { color: #991b1b; background: #fef2f2; }',
        danger + ' ' + btnPri + ' { color: #fff; background: #dc2626; }',
        dark(danger) + ' {',
        '  background: color-mix(in srgb, #dc2626 22%, var(--background, #121212));',
        '}',
        dark(danger + ' ' + title) + ',',
        dark(danger + ' ' + body) + ',',
        dark(danger + ' ' + body + ' a') + ' { color: #fca5a5; }',
        dark(danger + ' ' + footer) + ' { border-top-color: #7f1d1d; }',
        dark(danger + ' ' + btnSec) + ' {',
        '  color: #fecaca; background: color-mix(in srgb, #dc2626 28%, var(--background, #121212));',
        '}',
        amber + ',',
        amberSoft + ' {',
        '  margin-bottom: 20px; padding: 14px;',
        '  background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px;',
        '}',
        amberSoft + ' {',
        '  padding: 12px; border-width: 1px; border-radius: 6px;',
        '}',
        amber + ' ' + title + ',',
        amber + ' ' + body + ',',
        amber + ' ' + body + ' a,',
        amberSoft + ' ' + title + ',',
        amberSoft + ' ' + body + ',',
        amberSoft + ' ' + body + ' a { color: #92400e; }',
        amber + ' ' + body + ' a,',
        amberSoft + ' ' + body + ' a { text-decoration: underline; font-weight: 600; }',
        amber + ' ' + footer + ',',
        amberSoft + ' ' + footer + ' {',
        '  margin-top: 12px; padding-top: 10px; border-top: 1px solid #fcd34d;',
        '  text-align: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;',
        '}',
        amber + ' ' + btnSec + ',',
        amberSoft + ' ' + btnSec + ' {',
        '  display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600;',
        '  border-radius: 6px; cursor: pointer; border: 1px solid #f59e0b;',
        '  color: #92400e; background: #fffbeb; text-decoration: none;',
        '}',
        dark(amber) + ',',
        dark(amberSoft) + ' {',
        '  color: #fcd34d;',
        '  background: color-mix(in srgb, #f59e0b 22%, var(--background, #121212));',
        '}',
        dark(amber + ' ' + title) + ',',
        dark(amber + ' ' + body) + ',',
        dark(amber + ' ' + body + ' a') + ',',
        dark(amberSoft + ' ' + title) + ',',
        dark(amberSoft + ' ' + body) + ',',
        dark(amberSoft + ' ' + body + ' a') + ' { color: #fcd34d; }',
        dark(amber + ' ' + footer) + ',',
        dark(amberSoft + ' ' + footer) + ' { border-top-color: #92400e; }',
        dark(amber + ' ' + btnSec) + ',',
        dark(amberSoft + ' ' + btnSec) + ' {',
        '  color: #fef3c7; background: color-mix(in srgb, #f59e0b 28%, var(--background, #121212));',
        '}'
    ];
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
    const danger = p + '.wf-dash-btn--danger';
    const success = p + '.wf-dash-btn--success';
    const warning = p + '.wf-dash-btn--warning';
    const headerBasic = p + '.wf-dash-header-btn.wf-dash-btn--basic';
    const light = (sel) => 'html[data-fleet-ux-theme="light"] ' + sel;
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;

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
        '  border: 1px solid var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  background: var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  color: var(--primary-foreground, ' + FLEET_UI_ACCENT_FG + ');',
        '}',
        primary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 88%, #000);',
        '  border-color: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        secondary + ' {',
        '  border: 1px solid var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '}',
        secondary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 10%, var(--background, #fff));',
        '  border-color: var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  color: var(--foreground, #0f172a);',
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
        tertiary + '.wf-dash-btn--icon {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '}',
        tertiary + '.wf-dash-btn--icon:hover:not(:disabled) {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  border: none;',
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
        tertiary + '.wf-dash-btn--icon:disabled {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '}',
        btn + ':disabled[aria-busy="true"] { opacity: 0.65; cursor: wait; }',
        headerBasic + ' { color: var(--muted-foreground, #64748b); }',
        headerBasic + ':hover:not(:disabled) {',
        '  color: var(--foreground, #0f172a);',
        '  border-color: var(--foreground, #0f172a);',
        '}',
        // Preferred-opaque recipes (do not trust host CSS vars alone)
        light(primary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(primary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  border-color: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(secondary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: #ffffff;',
        '  color: #111111;',
        '}',
        light(secondary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 10%, #ffffff);',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  color: #111111;',
        '}',
        light(tertiary) + ' {',
        '  border-color: #e5e5e5;',
        '  background: #ffffff;',
        '  color: #666666;',
        '}',
        light(tertiary) + ':hover:not(:disabled) {',
        '  background: #f0f0f0;',
        '  border-color: #333333;',
        '  color: #333333;',
        '}',
        light(tertiary + '.wf-dash-btn--icon') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #666666;',
        '}',
        light(tertiary + '.wf-dash-btn--icon:hover:not(:disabled)') + ' {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  color: #333333;',
        '}',
        light(tertiary + '.wf-dash-btn--icon:disabled') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #999999;',
        '}',
        light(danger) + ' {',
        '  border: 1px solid #dc2626;',
        '  background: transparent;',
        '  color: #dc2626;',
        '}',
        light(danger) + ':hover:not(:disabled) {',
        '  background: #fee2e2;',
        '  border-color: #b91c1c;',
        '  color: #b91c1c;',
        '}',
        light(success) + ' {',
        '  border: 1px solid #16a34a;',
        '  background: transparent;',
        '  color: #16a34a;',
        '}',
        light(success) + ':hover:not(:disabled) {',
        '  background: #16a34a;',
        '  border-color: #16a34a;',
        '  color: #ffffff;',
        '}',
        light(warning) + ' {',
        '  border: 1px solid #ca8a04;',
        '  background: color-mix(in srgb, #ca8a04 14%, transparent);',
        '  color: #a16207;',
        '}',
        light(warning) + ':hover:not(:disabled) {',
        '  background: #ca8a04;',
        '  border-color: #ca8a04;',
        '  color: #ffffff;',
        '}',
        light(primary + ':disabled') + ', ' + light(secondary + ':disabled') + ', ' + light(tertiary + ':disabled') + ', ' + light(danger + ':disabled') + ', ' + light(success + ':disabled') + ', ' + light(warning + ':disabled') + ' {',
        '  border-color: #e5e5e5;',
        '  background: #f0f0f0;',
        '  color: #999999;',
        '}',
        light(headerBasic) + ' { color: #666666; }',
        light(headerBasic) + ':hover:not(:disabled) { color: #111111; border-color: #111111; }',
        dark(primary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(primary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  border-color: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(secondary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: #18181b;',
        '  color: #e4e4e7;',
        '}',
        dark(secondary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 14%, #18181b);',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary) + ' {',
        '  border-color: #3f3f46;',
        '  background: #18181b;',
        '  color: #a1a1aa;',
        '}',
        dark(tertiary) + ':hover:not(:disabled) {',
        '  background: #27272a;',
        '  border-color: #e4e4e7;',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #a1a1aa;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon:hover:not(:disabled)') + ' {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon:disabled') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #71717a;',
        '}',
        dark(danger) + ' {',
        '  border: 1px solid #dc2626;',
        '  background: transparent;',
        '  color: #fca5a5;',
        '}',
        dark(danger) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, #dc2626 22%, #18181b);',
        '  border-color: #f87171;',
        '  color: #fecaca;',
        '}',
        dark(success) + ' {',
        '  border: 1px solid #22c55e;',
        '  background: transparent;',
        '  color: #86efac;',
        '}',
        dark(success) + ':hover:not(:disabled) {',
        '  background: #16a34a;',
        '  border-color: #16a34a;',
        '  color: #ffffff;',
        '}',
        dark(warning) + ' {',
        '  border-color: #ca8a04;',
        '  background: color-mix(in srgb, #ca8a04 18%, transparent);',
        '  color: #fde68a;',
        '}',
        dark(warning) + ':hover:not(:disabled) {',
        '  background: #ca8a04;',
        '  border-color: #ca8a04;',
        '  color: #ffffff;',
        '}',
        dark(primary + ':disabled') + ', ' + dark(secondary + ':disabled') + ', ' + dark(tertiary + ':disabled') + ', ' + dark(danger + ':disabled') + ', ' + dark(success + ':disabled') + ', ' + dark(warning + ':disabled') + ' {',
        '  border-color: #3f3f46;',
        '  background: #27272a;',
        '  color: #71717a;',
        '}',
        dark(headerBasic) + ' { color: #a1a1aa; }',
        dark(headerBasic) + ':hover:not(:disabled) { color: #e4e4e7; border-color: #e4e4e7; }'
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
            Logger.warn('copy skipped (empty ' + options.logLabel + ')');
        }
        return false;
    }
    const ok = await fleetUiCopyText(value);
    if (ok) {
        fleetUiFlashSuccess(el, options);
        if (options.logLabel) {
            Logger.log('copied ' + options.logLabel + ' (' + value.length + ' chars)');
        }
    } else {
        fleetUiFlashFailure(el, options);
        if (options.logLabel) {
            Logger.warn('copy ' + options.logLabel + ' failed');
        }
    }
    return ok;
}

function fleetUiBtnClass(variant, size) {
    const v = BTN_VARIANTS[variant] || BTN_VARIANTS.basic;
    const s = BTN_SIZES[size] || BTN_SIZES.nav;
    return 'wf-dash-btn ' + v + ' ' + s;
}

function fleetUiEscapeAttr(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function fleetUiEscapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fleetUiSegmentCssLines(prefix) {
    const p = prefix || '';
    const light = (sel) => 'html[data-fleet-ux-theme="light"] ' + sel;
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;
    const group = p + '.fleet-ui-seg-group';
    const btn = p + '.fleet-ui-seg-btn';
    return [
        group + ' {',
        '  display: inline-flex;',
        '  border-radius: 6px;',
        '  overflow: hidden;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 6%, var(--card, #fff));',
        '}',
        p + '.fleet-ui-seg-group--fill {',
        '  display: flex;',
        '  width: 100%;',
        '}',
        btn + ' {',
        '  padding: 5px 12px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border: none;',
        '  cursor: pointer;',
        '  background: transparent;',
        '  color: var(--foreground, #0f172a);',
        '  transition: background-color 0.15s, color 0.15s;',
        '  line-height: 1.4;',
        '}',
        p + '.fleet-ui-seg-group--fill .fleet-ui-seg-btn {',
        '  flex: 1;',
        '  padding: 8px 10px;',
        '}',
        p + '.fleet-ui-seg-btn--divider {',
        '  border-right: 1px solid var(--border, #e2e8f0);',
        '}',
        btn + '[aria-pressed="true"] {',
        '  background: var(--brand, ' + FLEET_UI_ACCENT + ');',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        btn + ':not([aria-pressed="true"]):hover {',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 10%, transparent);',
        '  color: var(--foreground, #0f172a);',
        '}',
        light(group) + ' {',
        '  border-color: #e5e5e5;',
        '  background: #f0f0f0;',
        '}',
        light(btn) + ' {',
        '  color: #333333;',
        '  background: transparent;',
        '}',
        light(p + '.fleet-ui-seg-btn--divider') + ' { border-right-color: #e5e5e5; }',
        light(btn + '[aria-pressed="true"]') + ' {',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(btn + ':not([aria-pressed="true"]):hover') + ' {',
        '  background: #e5e5e5;',
        '  color: #111111;',
        '}',
        dark(group) + ' {',
        '  border-color: #3f3f46;',
        '  background: #18181b;',
        '}',
        dark(btn) + ' {',
        '  color: #a1a1aa;',
        '  background: transparent;',
        '}',
        dark(p + '.fleet-ui-seg-btn--divider') + ' { border-right-color: #3f3f46; }',
        dark(btn + '[aria-pressed="true"]') + ' {',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(btn + ':not([aria-pressed="true"]):hover') + ' {',
        '  background: #27272a;',
        '  color: #e4e4e7;',
        '}'
    ];
}

function fleetUiFilterToggleCssLines(prefix) {
    const p = prefix || '';
    return [
        p + '.fleet-ui-filter-toggle {',
        '  padding: 7px 14px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border-radius: 6px;',
        '  cursor: pointer;',
        '  border: 2px solid var(--border, #e2e8f0);',
        '  color: var(--muted-foreground, #64748b);',
        '  background: transparent;',
        '  opacity: 0.6;',
        '}',
        p + '.fleet-ui-filter-toggle[aria-pressed="true"] {',
        '  opacity: 1;',
        '}'
    ];
}

function fleetUiSegmentBtnClass(divider) {
    return SEGMENT_CLASSES.btn + (divider ? ' ' + SEGMENT_CLASSES.btnDivider : '');
}

function fleetUiSegmentBtnHtml(opts) {
    const o = opts || {};
    const valueAttr = o.valueAttr || 'data-value';
    const divider = !!o.divider;
    const active = !!o.active;
    const idAttr = o.id ? ' id="' + fleetUiEscapeAttr(o.id) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    return '<button type="button" class="' + fleetUiSegmentBtnClass(divider) + '" '
        + valueAttr + '="' + fleetUiEscapeAttr(o.value) + '" aria-pressed="'
        + (active ? 'true' : 'false') + '"' + idAttr + extra + '>'
        + fleetUiEscapeHtml(o.label) + '</button>';
}

function fleetUiSegmentGroupHtml(opts) {
    const o = opts || {};
    const options = Array.isArray(o.options) ? o.options : [];
    const valueAttr = o.valueAttr || 'data-value';
    const value = o.value;
    const fill = o.fill === true;
    const groupClass = SEGMENT_CLASSES.group + (fill ? ' ' + SEGMENT_CLASSES.groupFill : '');
    const buttons = options.map((opt, i) => fleetUiSegmentBtnHtml({
        value: opt.value,
        label: opt.label,
        id: opt.id,
        extraAttrs: opt.extraAttrs,
        valueAttr,
        active: String(opt.value) === String(value),
        divider: i < options.length - 1
    })).join('');
    const labelAttr = o.ariaLabel ? ' aria-label="' + fleetUiEscapeAttr(o.ariaLabel) + '"' : '';
    const styleAttr = o.style ? ' style="' + fleetUiEscapeAttr(o.style) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    return '<div class="' + groupClass + '" role="group"' + labelAttr + styleAttr + extra + '>'
        + buttons + '</div>';
}

function fleetUiSyncSegmentGroup(root, value, valueAttr) {
    if (!root) return;
    const attr = valueAttr || 'data-value';
    root.querySelectorAll('.' + SEGMENT_CLASSES.btn).forEach((btn) => {
        const v = btn.getAttribute(attr);
        const active = String(v) === String(value);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function fleetUiBindSegmentGroup(root, options) {
    if (!root) return;
    const opts = options || {};
    const valueAttr = opts.valueAttr || 'data-value';
    if (root.dataset.fleetUiSegBound === '1') return;
    root.dataset.fleetUiSegBound = '1';
    root.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest
            ? e.target.closest('.' + SEGMENT_CLASSES.btn)
            : null;
        if (!btn || !root.contains(btn)) return;
        const next = btn.getAttribute(valueAttr);
        if (next == null) return;
        fleetUiSyncSegmentGroup(root, next, valueAttr);
        if (typeof opts.onChange === 'function') {
            opts.onChange(next, btn);
        }
    });
}

function fleetUiFilterToggleClass() {
    return FILTER_TOGGLE_CLASSES.btn;
}

function fleetUiFilterToggleHtml(opts) {
    const o = opts || {};
    const pressed = !!o.pressed;
    const idAttr = o.id ? ' id="' + fleetUiEscapeAttr(o.id) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    const css = pressed && o.activeCss
        ? String(o.activeCss).replace(/"/g, '&quot;')
        : '';
    const styleAttr = css ? ' style="' + css + '"' : '';
    return '<button type="button" class="' + fleetUiFilterToggleClass() + '" aria-pressed="'
        + (pressed ? 'true' : 'false') + '"' + idAttr + styleAttr + extra + '>'
        + fleetUiEscapeHtml(o.label) + '</button>';
}

function fleetUiApplyFilterToggle(btn, pressed, activeCss) {
    if (!btn) return;
    btn.classList.add(FILTER_TOGGLE_CLASSES.btn);
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.style.cssText = pressed && activeCss ? activeCss : '';
}

function fleetUiSpinnerHtml(sizePx) {
    const size = sizePx || 16;
    return '<span class="fleet-ui-spinner" aria-hidden="true" style="width: ' + size + 'px; height: ' + size + 'px;"></span>';
}

function fleetUiLoadingDotsAttr() {
    return 'data-fleet-ui-dots';
}

/** Shared button-icon SVGs (basic+icon chrome). */
function fleetUiEyeIconSvg() {
    return '<svg width="15.4" height="15.4" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<path d="M13 6.9C6.9 6.9 2.1 13.2 2.1 13.2S6.9 19.5 13 19.5c4.7 0 10.9-6.3 10.9-6.3S17.6 6.9 13 6.9z"></path>'
        + '<circle cx="13" cy="13.2" r="3.2"></circle>'
        + '</svg>';
}

function fleetUiFlagIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<line x1="7.5" y1="2" x2="7.5" y2="24"></line>'
        + '<path d="M7.5 3.5 L22.5 10 L7.5 16.5 Z" fill="#dc2626" stroke="none"></path>'
        + '</svg>';
}

function fleetUiFunnelIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<line x1="4" y1="7" x2="20" y2="7"></line>'
        + '<line x1="7" y1="12" x2="17" y2="12"></line>'
        + '<line x1="10" y1="17" x2="14" y2="17"></line>'
        + '</svg>';
}

function fleetUiExternalLinkIconSvg(opts) {
    const active = !(opts && opts.active === false);
    const stroke = active ? 'currentColor' : 'var(--muted-foreground, #94a3b8)';
    const opacity = active ? '1' : '0.45';
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity: ' + opacity + '; flex-shrink:0;">'
        + '<path d="M15 3h6v6"></path>'
        + '<path d="M10 14 21 3"></path>'
        + '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>'
        + '</svg>';
}

function fleetUiCopyIconSvg(opts) {
    const raw = opts && opts.size != null ? Number(opts.size) : 13;
    const size = Number.isFinite(raw) && raw > 0 ? raw : 13;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>'
        + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'
        + '</svg>';
}

function fleetUiFlashTabSuccess(tabEl) {
    if (!tabEl) return;
    tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    void tabEl.offsetWidth;
    tabEl.classList.add('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    tabEl.addEventListener('animationend', () => {
        tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    }, { once: true });
    Logger.debug('tab pulse');
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
    description: 'Shared UI tokens, buttons, icon SVGs, segments, filter toggles, panels, and copy feedback',
    _version: '3.15',
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
            ensureStyles();
            let style = (root.getElementById && root.getElementById(styleId))
                || (root.querySelector && root.querySelector('#' + styleId))
                || document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
            }
            style.textContent = fleetUiBtnBaseCssLines(scopeSelector + ' ').join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensurePanelStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiPanelScopeStyleId(scopeSelector)
                : FLEET_UI_PANEL_STYLE_ID;
            const root = appendRoot || document;
            if (root.getElementById && root.getElementById(styleId)) return;
            if (root.querySelector && root.querySelector('#' + styleId)) return;
            if (document.getElementById(styleId)) return;
            const style = document.createElement('style');
            style.id = styleId;
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiPanelCssLines(prefix).join('\n');
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
        }

        function ensureSegmentStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiSegmentScopeStyleId(scopeSelector)
                : FLEET_UI_SEGMENT_STYLE_ID;
            const root = appendRoot || document;
            let style = (root.getElementById && root.getElementById(styleId))
                || (root.querySelector && root.querySelector('#' + styleId))
                || document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
            }
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiSegmentCssLines(prefix).join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensureFilterToggleStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiFilterToggleScopeStyleId(scopeSelector)
                : FLEET_UI_FILTER_TOGGLE_STYLE_ID;
            const root = appendRoot || document;
            if (root.getElementById && root.getElementById(styleId)) return;
            if (root.querySelector && root.querySelector('#' + styleId)) return;
            if (document.getElementById(styleId)) return;
            const style = document.createElement('style');
            style.id = styleId;
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiFilterToggleCssLines(prefix).join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensureAlertBannerStyles() {
            ensureStyles();
            fleetUiEnsureThemeObserver();
            if (document.getElementById(FLEET_UI_ALERT_BANNER_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_ALERT_BANNER_STYLE_ID;
            style.textContent = fleetUiAlertBannerCssLines().join('\n');
            (document.head || document.documentElement).appendChild(style);
        }

        ensureStyles();
        fleetUiEnsureThemeObserver();

        Context.uiLib = {
            FLASH_PULSE_MS,
            FLASH_PULSE_EASING,
            COPY_SUCCESS_MS,
            COPY_FAILURE_MS,
            COPY_SUCCESS_BG,
            COPY_FAILURE_BG,
            SPIN_DURATION,
            TAB_PULSE_MS,
            PANEL_CLASSES,
            ALERT_BANNER_CLASSES,
            SEGMENT_CLASSES,
            FILTER_TOGGLE_CLASSES,

            ensureStyles,
            ensureButtonStyles,
            ensurePanelStyles,
            ensureUserStoryMarkdownStyles,
            ensureSegmentStyles,
            ensureFilterToggleStyles,
            ensureAlertBannerStyles,
            btnClass: fleetUiBtnClass,
            spinnerHtml: fleetUiSpinnerHtml,
            loadingDotsAttr: fleetUiLoadingDotsAttr,
            eyeIconSvg: fleetUiEyeIconSvg,
            flagIconSvg: fleetUiFlagIconSvg,
            funnelIconSvg: fleetUiFunnelIconSvg,
            externalLinkIconSvg: fleetUiExternalLinkIconSvg,
            copyIconSvg: fleetUiCopyIconSvg,

            segmentBtnClass: fleetUiSegmentBtnClass,
            segmentBtnHtml: fleetUiSegmentBtnHtml,
            segmentGroupHtml: fleetUiSegmentGroupHtml,
            syncSegmentGroup: fleetUiSyncSegmentGroup,
            bindSegmentGroup: fleetUiBindSegmentGroup,

            filterToggleClass: fleetUiFilterToggleClass,
            filterToggleHtml: fleetUiFilterToggleHtml,
            applyFilterToggle: fleetUiApplyFilterToggle,

            isFleetDark: fleetUiIsFleetDark,
            getFleetTheme: fleetUiGetFleetTheme,
            chromeColors: fleetUiChromeColors,
            onThemeChange: fleetUiOnThemeChange,
            getThemeMode: fleetUiGetThemeMode,
            setThemeMode: fleetUiSetThemeMode,
            resolveTheme: fleetUiResolveTheme,
            syncThemeDataset: () => fleetUiSyncThemeDataset(true),

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
            Logger.log('module registered (Context.uiLib, Context.buttonFeedback)');
            self.initialState.registered = true;
        }
    }
};
