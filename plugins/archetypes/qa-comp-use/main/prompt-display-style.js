// ============= prompt-display-style.js =============
// View-mode prompt font size, text color, and background controls with a styled replica.

const STYLE_ID = 'fleet-prompt-display-style';
const CONTROLS_MARKER = 'data-fleet-prompt-style-controls';
const ORIGINAL_MARKER = 'data-fleet-prompt-display-original';
const REPLICA_MARKER = 'data-fleet-prompt-display-replica';
const JSCOLOR_VENDOR_PATH = 'shared/vendor/jscolor.min.js';

const FONT_MIN = 8;
const FONT_MAX = 30;
const FONT_DEFAULT = 14;
const BG_DEFAULT = 'transparent';

function gmFetchText(url) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload(response) {
                if (response.status === 200) {
                    resolve(response.responseText);
                } else {
                    reject(new Error('HTTP ' + response.status + ' for ' + url));
                }
            },
            onerror(error) {
                reject(error || new Error('Network error for ' + url));
            }
        });
    });
}

const plugin = {
    id: 'promptDisplayStyle',
    name: 'Prompt Display Style',
    description: 'Adjust prompt font size, text color, and background in view mode',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        fontSize: 'qa-comp-use-prompt-display-font-size',
        textColor: 'qa-comp-use-prompt-display-text-color',
        bgColor: 'qa-comp-use-prompt-display-bg-color'
    },

    initialState: {
        activationLogged: false,
        sectionMissingLogged: false,
        editModeLogged: false,
        styleInjected: false,
        jscolorLoadPromise: null,
        jscolorFailed: false,
        activeSection: null,
        textObserver: null
    },

    onMutation(state) {
        const section = this.findPromptSection();
        if (!section) {
            if (state.activeSection) {
                this.teardown(state);
            }
            if (!state.sectionMissingLogged) {
                Logger.debug(`${this.id}: Prompt section not found`);
                state.sectionMissingLogged = true;
            }
            return;
        }
        state.sectionMissingLogged = false;

        if (this.isEditMode(section)) {
            if (state.activeSection) {
                if (!state.editModeLogged) {
                    Logger.debug(`${this.id}: edit mode — styling inactive`);
                    state.editModeLogged = true;
                }
                this.teardown(state);
            }
            return;
        }

        state.editModeLogged = false;

        const displayEl = this.findDisplayEl(section);
        if (!displayEl) {
            return;
        }

        if (state.activeSection && state.activeSection !== section) {
            this.teardown(state);
        }

        this.ensureStyles(state);
        this.ensureReplica(section, displayEl, state);
        this.ensureControls(section, displayEl, state);
    },

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    findPromptLabelEl(section) {
        const label = section.querySelector('label');
        const span = section.querySelector('span.text-sm.text-muted-foreground.font-medium');
        if (label && label.textContent.trim() === 'Prompt') {
            return label;
        }
        if (span && span.textContent.trim() === 'Prompt') {
            return span;
        }
        return null;
    },

    findDisplayEl(section) {
        return section.querySelector('div.whitespace-pre-wrap.text-sm');
    },

    isEditMode(section) {
        return !!section.querySelector('textarea');
    },

    ensureStyles(state) {
        if (state.styleInjected || document.getElementById(STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '[' + ORIGINAL_MARKER + '="true"] {',
            '  position: absolute !important;',
            '  width: 1px !important;',
            '  height: 1px !important;',
            '  overflow: hidden !important;',
            '  clip: rect(0,0,0,0) !important;',
            '  white-space: nowrap !important;',
            '  border: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '}',
            '[' + CONTROLS_MARKER + '="true"] input[type="number"] {',
            '  width: 3rem;',
            '  height: 1.25rem;',
            '  padding: 0 0.25rem;',
            '  font-size: 0.75rem;',
            '  line-height: 1;',
            '  border-radius: 0.125rem;',
            '  border: 1px solid var(--border, #e5e5e5);',
            '  background: transparent;',
            '}',
            '[' + CONTROLS_MARKER + '="true"] button.jscolor {',
            '  width: 1.25rem !important;',
            '  height: 1.25rem !important;',
            '  min-width: 1.25rem !important;',
            '  padding: 0 !important;',
            '  border-radius: 0.125rem;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
        CleanupRegistry.registerElement(style);
        state.styleInjected = true;
    },

    getVendorUrl() {
        const owner = Context.githubOwner || 'Fleet-AI-Operations';
        const repo = Context.githubRepo || 'fleet-ux-improvements';
        const branch = Context.githubBranch || 'main';
        return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/plugins/' + JSCOLOR_VENDOR_PATH;
    },

    ensureJscolor(state) {
        if (typeof window.jscolor !== 'undefined') {
            return Promise.resolve(window.jscolor);
        }
        if (state.jscolorFailed) {
            return Promise.reject(new Error('jscolor previously failed to load'));
        }
        if (state.jscolorLoadPromise) {
            return state.jscolorLoadPromise;
        }

        state.jscolorLoadPromise = gmFetchText(this.getVendorUrl())
            .then((code) => {
                const load = new Function(code + '\nreturn typeof jscolor !== "undefined" ? jscolor : null;');
                const instance = load();
                if (!instance) {
                    throw new Error('jscolor global missing after load');
                }
                instance.init();
                Logger.debug(`${this.id}: jscolor loaded`);
                return instance;
            })
            .catch((err) => {
                state.jscolorFailed = true;
                Logger.warn(`${this.id}: jscolor load failed — color pickers unavailable`, err);
                throw err;
            })
            .finally(() => {
                state.jscolorLoadPromise = null;
            });

        return state.jscolorLoadPromise;
    },

    clampFontSize(value) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed)) {
            return FONT_DEFAULT;
        }
        return Math.max(FONT_MIN, Math.min(FONT_MAX, parsed));
    },

    rgbToHex(color) {
        if (!color || color === 'transparent') {
            return '#000000';
        }
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) {
            return color.startsWith('#') ? color : '#000000';
        }
        const hex = (n) => ('0' + parseInt(n, 10).toString(16)).slice(-2);
        return '#' + hex(match[1]) + hex(match[2]) + hex(match[3]);
    },

    getDefaultTextColor(displayEl) {
        return window.getComputedStyle(displayEl).color || '#000000';
    },

    getDefaultPrefs(displayEl) {
        return {
            fontSize: FONT_DEFAULT,
            textColor: this.getDefaultTextColor(displayEl),
            bgColor: BG_DEFAULT
        };
    },

    getPrefs(displayEl) {
        const storedText = Storage.get(this.storageKeys.textColor, null);
        const storedBg = Storage.get(this.storageKeys.bgColor, null);
        return {
            fontSize: this.clampFontSize(Storage.get(this.storageKeys.fontSize, FONT_DEFAULT)),
            textColor: storedText != null && storedText !== '' ? storedText : this.getDefaultTextColor(displayEl),
            bgColor: storedBg != null && storedBg !== '' ? storedBg : BG_DEFAULT
        };
    },

    lineHeightForFontSize(fontSize) {
        const size = this.clampFontSize(fontSize);
        const ratio = size <= FONT_DEFAULT ? 1.5 : 1.5 + Math.min(0.4, (size - FONT_DEFAULT) * 0.03);
        return String(Math.round(size * ratio)) + 'px';
    },

    applyStyles(replica, prefs) {
        if (!replica) {
            return;
        }
        replica.style.fontSize = prefs.fontSize + 'px';
        replica.style.lineHeight = this.lineHeightForFontSize(prefs.fontSize);
        replica.style.color = prefs.textColor;
        replica.style.backgroundColor = prefs.bgColor;
        if (prefs.bgColor && prefs.bgColor !== BG_DEFAULT && prefs.bgColor !== 'transparent') {
            replica.style.padding = '0.5rem';
            replica.style.borderRadius = '0.25rem';
        } else {
            replica.style.padding = '';
            replica.style.borderRadius = '';
        }
    },

    syncReplicaText(original, replica) {
        if (!original || !replica) {
            return;
        }
        replica.textContent = original.textContent;
    },

    disconnectTextObserver(state) {
        if (state.textObserver) {
            state.textObserver.disconnect();
            state.textObserver = null;
        }
    },

    attachTextObserver(original, replica, state) {
        this.disconnectTextObserver(state);
        const observer = new MutationObserver(() => {
            this.syncReplicaText(original, replica);
        });
        observer.observe(original, {
            characterData: true,
            childList: true,
            subtree: true
        });
        CleanupRegistry.registerObserver(observer);
        state.textObserver = observer;
    },

    ensureReplica(section, displayEl, state) {
        displayEl.setAttribute(ORIGINAL_MARKER, 'true');

        let replica = section.querySelector('[' + REPLICA_MARKER + '="true"]');
        if (!replica) {
            replica = document.createElement('div');
            replica.setAttribute(REPLICA_MARKER, 'true');
            replica.setAttribute('data-fleet-plugin', this.id);
            replica.className = 'whitespace-pre-wrap text-sm';
            displayEl.insertAdjacentElement('afterend', replica);
        }

        const prefs = this.getPrefs(displayEl);
        this.syncReplicaText(displayEl, replica);
        this.applyStyles(replica, prefs);
        this.attachTextObserver(displayEl, replica, state);
        state.activeSection = section;

        if (!state.activationLogged) {
            Logger.log(`${this.id}: styling active (font=${prefs.fontSize}px)`);
            state.activationLogged = true;
        }
    },

    makeResetBtn(title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '↺';
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
            width: 20px;
            height: 20px;
            font-size: 13px;
            color: #888;
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

    resetToDefaults(section, displayEl, prefs, fontInput, textBtn, bgBtn) {
        Storage.delete(this.storageKeys.fontSize);
        Storage.delete(this.storageKeys.textColor);
        Storage.delete(this.storageKeys.bgColor);

        const defaults = this.getDefaultPrefs(displayEl);
        prefs.fontSize = defaults.fontSize;
        prefs.textColor = defaults.textColor;
        prefs.bgColor = defaults.bgColor;

        fontInput.value = String(defaults.fontSize);

        if (textBtn && textBtn.jscolor) {
            textBtn.jscolor.fromString(this.rgbToHex(defaults.textColor));
        }
        if (bgBtn && bgBtn.jscolor) {
            bgBtn.jscolor.fromString('rgba(0,0,0,0)');
        }

        const liveReplica = section.querySelector('[' + REPLICA_MARKER + '="true"]');
        this.applyStyles(liveReplica, prefs);
        Logger.log(`${this.id}: reset to defaults (font=${defaults.fontSize}px)`);
    },

    createColorButton(kind, initialColor, alpha) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-prompt-color', kind);
        button.setAttribute('aria-label', kind === 'bg' ? 'Background color' : 'Text color');
        button.className = 'inline-flex items-center justify-center rounded-sm border border-input';
        const options = {
            value: initialColor,
            preset: 'small',
            closeButton: false,
            previewSize: 20,
            width: 101,
            height: 101
        };
        if (alpha) {
            options.alphaChannel = true;
        }
        button.setAttribute('data-jscolor', JSON.stringify(options));
        return button;
    },

    findCopyButtonAnchor(section) {
        const fleetCopy = section.querySelector('[data-fleet-copy-prompt="true"]');
        if (fleetCopy) {
            return fleetCopy;
        }

        const header = section.querySelector('.flex.items-center.justify-between');
        const searchRoot = header
            ? header.querySelector('.flex.items-center.gap-2') || header
            : section;

        const buttons = searchRoot.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (text === 'Copy') {
                return btn;
            }
        }
        return null;
    },

    ensureControls(section, displayEl, state) {
        const copyAnchor = this.findCopyButtonAnchor(section);
        if (!copyAnchor) {
            return;
        }

        let controls = section.querySelector('[' + CONTROLS_MARKER + '="true"]');
        if (controls) {
            return;
        }

        const prefs = this.getPrefs(displayEl);

        controls = document.createElement('div');
        controls.setAttribute(CONTROLS_MARKER, 'true');
        controls.setAttribute('data-fleet-plugin', this.id);
        controls.className = 'inline-flex items-center gap-1.5 ml-2';

        const fontLabel = document.createElement('span');
        fontLabel.className = 'text-xs text-muted-foreground';
        fontLabel.textContent = 'Font';

        const fontInput = document.createElement('input');
        fontInput.type = 'number';
        fontInput.min = String(FONT_MIN);
        fontInput.max = String(FONT_MAX);
        fontInput.step = '1';
        fontInput.value = String(prefs.fontSize);
        fontInput.setAttribute('aria-label', 'Prompt font size');

        fontInput.addEventListener('input', () => {
            const prev = prefs.fontSize;
            const next = this.clampFontSize(fontInput.value);
            fontInput.value = String(next);
            prefs.fontSize = next;
            Storage.set(this.storageKeys.fontSize, next);
            const liveReplica = section.querySelector('[' + REPLICA_MARKER + '="true"]');
            this.applyStyles(liveReplica, prefs);
            if (next !== prev) {
                Logger.log(`${this.id}: font ${prev}→${next}`);
            }
        });

        controls.appendChild(fontLabel);
        controls.appendChild(fontInput);

        copyAnchor.insertAdjacentElement('afterend', controls);

        const appendResetButton = (textBtn, bgBtn) => {
            const resetBtn = this.makeResetBtn('Reset to defaults', () => {
                this.resetToDefaults(section, displayEl, prefs, fontInput, textBtn, bgBtn);
            });
            controls.appendChild(resetBtn);
        };

        this.ensureJscolor(state)
            .then((jscolor) => {
                if (!controls.isConnected || this.isEditMode(section)) {
                    return;
                }

                const replicaEl = section.querySelector('[' + REPLICA_MARKER + '="true"]');
                const textBtn = this.createColorButton('text', this.rgbToHex(prefs.textColor), false);
                controls.appendChild(textBtn);

                const bgLabel = document.createElement('span');
                bgLabel.className = 'text-xs text-muted-foreground';
                bgLabel.textContent = 'BG';
                controls.appendChild(bgLabel);

                const bgBtn = this.createColorButton('bg', prefs.bgColor === BG_DEFAULT ? '#FFFFFF' : prefs.bgColor, true);
                controls.appendChild(bgBtn);

                jscolor.install(controls);

                const wirePicker = (button, storageKey, kind) => {
                    if (!button.jscolor) {
                        return;
                    }
                    const applyColor = (logChange) => {
                        const value = button.jscolor.toRGBAString();
                        if (kind === 'bg') {
                            prefs.bgColor = value;
                        } else {
                            prefs.textColor = value;
                        }
                        Storage.set(storageKey, value);
                        const liveReplica = section.querySelector('[' + REPLICA_MARKER + '="true"]');
                        this.applyStyles(liveReplica, prefs);
                        if (logChange) {
                            Logger.log(`${this.id}: ${kind} ${value}`);
                        }
                    };
                    button.jscolor.option('onInput', () => applyColor(false));
                    button.jscolor.option('onChange', () => applyColor(true));
                };

                wirePicker(textBtn, this.storageKeys.textColor, 'text');
                wirePicker(bgBtn, this.storageKeys.bgColor, 'bg');
                appendResetButton(textBtn, bgBtn);

                if (replicaEl) {
                    this.applyStyles(replicaEl, prefs);
                }
            })
            .catch(() => {
                if (controls.isConnected && !this.isEditMode(section)) {
                    appendResetButton(null, null);
                }
            });
    },

    teardown(state) {
        this.disconnectTextObserver(state);

        document.querySelectorAll('[' + CONTROLS_MARKER + '="true"]').forEach((el) => el.remove());
        document.querySelectorAll('[' + REPLICA_MARKER + '="true"]').forEach((el) => el.remove());
        document.querySelectorAll('[' + ORIGINAL_MARKER + '="true"]').forEach((el) => {
            el.removeAttribute(ORIGINAL_MARKER);
        });

        if (typeof window.jscolor !== 'undefined' && window.jscolor.hide) {
            window.jscolor.hide();
        }

        state.activeSection = null;
        state.activationLogged = false;
    }
};
