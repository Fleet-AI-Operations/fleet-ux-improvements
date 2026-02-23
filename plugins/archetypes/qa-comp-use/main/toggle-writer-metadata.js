// ============= toggle-writer-metadata.js =============
// Toggle show/hide for the metadata section (label containing "metadata"). Button pulses yellow when hidden.

const METADATA_LABEL_MATCH = 'metadata';
const PULSE_INTERVAL_MS = 1000;
const YELLOW_BORDER = '2px solid #ca8a04';
const YELLOW_BOX_SHADOW = '0 2px 8px rgba(202, 138, 4, 0.4)';
const NORMAL_BORDER = '1px solid var(--border, #d4d4d4)';
const NORMAL_BOX_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.1)';

const BUTTON_CLASS = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

const plugin = {
    id: 'toggleWriterMetadata',
    name: 'Toggle Writer Metadata',
    description: 'Adds a Hide/Show button to collapse or expand the metadata section; button pulses yellow when hidden',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',

    _pulseInterval: null,

    initialState: {
        writerMetadataEnhanced: false,
        missingLogged: false
    },

    onMutation(state, context) {
        if (state.writerMetadataEnhanced) return;

        const section = this.findMetadataSection();
        if (!section) {
            if (!state.missingLogged) {
                Logger.debug('Toggle Writer Metadata: section with label containing "metadata" not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const labelSpan = section.firstElementChild;
        const contentDiv = labelSpan && labelSpan.nextElementSibling;
        if (!labelSpan || !contentDiv || contentDiv.tagName !== 'DIV') {
            Logger.warn('Toggle Writer Metadata: expected span + content div structure not found');
            return;
        }
        const innerContent = contentDiv.querySelector('.space-y-3') || contentDiv.firstElementChild;
        if (!innerContent) {
            Logger.warn('Toggle Writer Metadata: no inner content (space-y-3) found');
            return;
        }

        const header = document.createElement('div');
        header.className = 'flex flex-wrap items-center justify-between gap-2';
        header.setAttribute('data-fleet-plugin', this.id);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BUTTON_CLASS;
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.textContent = 'Hide';
        btn.title = 'Hide metadata';

        let hidden = false;
        let placeholderEl = null;

        const startPulse = () => {
            if (this._pulseInterval) return;
            btn.style.transition = 'border 1s ease, box-shadow 1s ease';
            let isYellow = true;
            btn.style.border = YELLOW_BORDER;
            btn.style.boxShadow = YELLOW_BOX_SHADOW;
            this._pulseInterval = setInterval(() => {
                isYellow = !isYellow;
                if (isYellow) {
                    btn.style.border = YELLOW_BORDER;
                    btn.style.boxShadow = YELLOW_BOX_SHADOW;
                } else {
                    btn.style.border = NORMAL_BORDER;
                    btn.style.boxShadow = NORMAL_BOX_SHADOW;
                }
            }, PULSE_INTERVAL_MS);
        };

        const stopPulse = () => {
            if (this._pulseInterval) {
                clearInterval(this._pulseInterval);
                this._pulseInterval = null;
            }
            btn.style.border = NORMAL_BORDER;
            btn.style.boxShadow = NORMAL_BOX_SHADOW;
        };

        btn.addEventListener('click', () => {
            hidden = !hidden;
            if (hidden) {
                innerContent.style.display = 'none';
                if (!placeholderEl) {
                    placeholderEl = document.createElement('span');
                    placeholderEl.setAttribute('data-fleet-plugin', this.id);
                    placeholderEl.className = 'text-xs text-muted-foreground';
                    placeholderEl.textContent = '[Metadata…]';
                }
                contentDiv.appendChild(placeholderEl);
                startPulse();
                Logger.log('Toggle Writer Metadata: metadata hidden');
            } else {
                innerContent.style.display = '';
                if (placeholderEl && placeholderEl.parentNode) {
                    placeholderEl.remove();
                }
                stopPulse();
                Logger.log('Toggle Writer Metadata: metadata shown');
            }
            btn.textContent = hidden ? 'Show' : 'Hide';
            btn.title = hidden ? 'Show metadata' : 'Hide metadata';
        });

        header.appendChild(labelSpan);
        header.appendChild(btn);
        section.insertBefore(header, contentDiv);

        state.writerMetadataEnhanced = true;
        Logger.log('✓ Toggle Writer Metadata: button added');
    },

    findMetadataSection() {
        const candidates = document.querySelectorAll('div.space-y-2');
        for (const section of candidates) {
            const first = section.firstElementChild;
            if (!first || first.tagName !== 'SPAN') continue;
            const labelText = (first.textContent || '').trim().toLowerCase();
            if (!labelText.includes(METADATA_LABEL_MATCH)) continue;
            const next = first.nextElementSibling;
            if (!next || next.tagName !== 'DIV') continue;
            if (!next.classList.contains('p-3') || !next.classList.contains('rounded-md') || !next.classList.contains('border')) continue;
            return section;
        }
        return null;
    },

    destroy() {
        if (this._pulseInterval) {
            clearInterval(this._pulseInterval);
            this._pulseInterval = null;
        }
    }
};
