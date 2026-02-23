// ============= metadata-tag-qa-enhancements.js =============
// Show/hide Writer Metadata section + QA pseudo-edit tag selections and copy suggested changes.
// Two submodule options work independently.

const METADATA_LABEL_MATCH = 'metadata';
const PULSE_INTERVAL_MS = 1000;
const YELLOW_BORDER = '2px solid #ca8a04';
const YELLOW_BOX_SHADOW = '0 2px 8px rgba(202, 138, 4, 0.4)';
const NORMAL_BORDER = '1px solid var(--border, #d4d4d4)';
const NORMAL_BOX_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.1)';
const BORDER_SUGGEST_DESELECT = '2px solid rgb(239, 68, 68)';
const BORDER_SUGGEST_SELECT = '2px solid rgb(34, 197, 94)';

const BUTTON_CLASS = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
const COPY_BTN_DISABLED_CLASS = 'opacity-50 cursor-not-allowed';

const SINGLE_SELECT_SECTIONS = ['goal_type', 'complexity_level'];

const plugin = {
    id: 'metadataTagQAEnhancements',
    name: 'Metadata Tag QA Enhancements',
    description: 'Show/hide Writer Metadata section and/or QA suggested tag changes (toggle tags + copy as text feedback)',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'show-hide-metadata',
            name: 'Show/Hide metadata section',
            description: 'Add Hide/Show button; button pulses yellow when hidden',
            enabledByDefault: true
        },
        {
            id: 'suggested-tag-changes',
            name: 'Suggested tag changes (toggle + copy)',
            description: 'Turn tags into toggle buttons and add Copy Suggested Changes? to paste as feedback',
            enabledByDefault: true
        }
    ],

    _pulseInterval: null,

    initialState: {
        writerMetadataEnhanced: false,
        missingLogged: false,
        tagState: [] // { el, workerSelected, qaToggled, sectionKey, tagLabel }
    },

    onMutation(state, context) {
        if (state.writerMetadataEnhanced) return;

        const found = this.findMetadataSection();
        if (!found) {
            if (!state.missingLogged) {
                Logger.debug('Metadata Tag QA Enhancements: section with label containing "metadata" not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const { section, titleSpan, contentDiv } = found;
        const innerContent = contentDiv.querySelector('.space-y-3') || contentDiv.firstElementChild;
        if (!innerContent) {
            Logger.warn('Metadata Tag QA Enhancements: no inner content (space-y-3) found');
            return;
        }

        const showHideEnabled = Storage.getSubOptionEnabled(this.id, 'show-hide-metadata', true);
        const suggestedChangesEnabled = Storage.getSubOptionEnabled(this.id, 'suggested-tag-changes', true);
        if (!showHideEnabled && !suggestedChangesEnabled) return;

        const header = this.ensureHeader(section, titleSpan, contentDiv, innerContent, showHideEnabled, suggestedChangesEnabled, state);
        if (!header) return;

        if (suggestedChangesEnabled) {
            state.tagState = [];
            this.buildTagToggles(innerContent, header, state);
            this.updateCopyButtonState(header, state);
        }

        state.writerMetadataEnhanced = true;
        Logger.log('✓ Metadata Tag QA Enhancements: show/hide and/or suggested tag changes applied');
    },

    findMetadataSection() {
        const candidates = document.querySelectorAll('div.space-y-2');
        for (const section of candidates) {
            let titleSpan = null;
            let contentDiv = null;
            const first = section.firstElementChild;
            if (first && first.tagName === 'SPAN') {
                const labelText = (first.textContent || '').trim().toLowerCase();
                if (!labelText.includes(METADATA_LABEL_MATCH)) continue;
                titleSpan = first;
                contentDiv = first.nextElementSibling;
            } else if (first && first.tagName === 'DIV' && first.getAttribute('data-fleet-plugin') === this.id) {
                titleSpan = first.querySelector('span');
                contentDiv = section.children[1];
            }
            if (!titleSpan || !contentDiv || contentDiv.tagName !== 'DIV') continue;
            if (!contentDiv.classList.contains('p-3') || !contentDiv.classList.contains('rounded-md') || !contentDiv.classList.contains('border')) continue;
            return { section, titleSpan, contentDiv, headerIfAny: section.querySelector(`div[data-fleet-plugin="${this.id}"]`) };
        }
        return null;
    },

    ensureHeader(section, titleSpan, contentDiv, innerContent, showHideEnabled, suggestedChangesEnabled, state) {
        let header = section.querySelector(`div[data-fleet-plugin="${this.id}"]`);
        if (!header) {
            header = document.createElement('div');
            header.className = 'flex flex-wrap items-center justify-between gap-2';
            header.setAttribute('data-fleet-plugin', this.id);
            if (titleSpan.parentNode === section) {
                section.insertBefore(header, contentDiv);
                header.appendChild(titleSpan);
            } else {
                const parent = titleSpan.closest('div[data-fleet-plugin]');
                if (parent && parent !== header) {
                    section.insertBefore(header, contentDiv);
                    header.appendChild(titleSpan);
                } else {
                    section.insertBefore(header, contentDiv);
                    header.appendChild(titleSpan);
                }
            }
        } else if (titleSpan.parentNode !== header) {
            header.insertBefore(titleSpan, header.firstChild);
        }

        const hideBtn = header.querySelector('[data-fleet-metadata-hide]');
        const copyBtn = header.querySelector('[data-fleet-metadata-copy]');

        if (showHideEnabled && !hideBtn) {
            const btn = this.createHideShowButton(innerContent, contentDiv, state);
            header.appendChild(btn);
        } else if (!showHideEnabled && hideBtn) {
            hideBtn.remove();
        }

        if (suggestedChangesEnabled && !copyBtn) {
            const btn = this.createCopyButton(header, state);
            header.appendChild(btn);
        } else if (!suggestedChangesEnabled && copyBtn) {
            copyBtn.remove();
        }

        return header;
    },

    createHideShowButton(innerContent, contentDiv, state) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BUTTON_CLASS;
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-fleet-metadata-hide', '1');
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
                btn.style.border = isYellow ? YELLOW_BORDER : NORMAL_BORDER;
                btn.style.boxShadow = isYellow ? YELLOW_BOX_SHADOW : NORMAL_BOX_SHADOW;
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
                Logger.log('Metadata Tag QA Enhancements: metadata hidden');
            } else {
                innerContent.style.display = '';
                if (placeholderEl && placeholderEl.parentNode) placeholderEl.remove();
                stopPulse();
                Logger.log('Metadata Tag QA Enhancements: metadata shown');
            }
            btn.textContent = hidden ? 'Show' : 'Hide';
            btn.title = hidden ? 'Show metadata' : 'Hide metadata';
        });
        return btn;
    },

    createCopyButton(header, state) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BUTTON_CLASS;
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-fleet-metadata-copy', '1');
        btn.textContent = 'Copy Suggested Changes?';
        btn.title = 'Copy suggested metadata tag changes to clipboard';
        btn.disabled = true;
        btn.classList.add(COPY_BTN_DISABLED_CLASS);

        btn.addEventListener('click', () => {
            const text = this.buildCopyText(state);
            navigator.clipboard.writeText(text).then(() => {
                Logger.log('Metadata Tag QA Enhancements: suggested changes copied to clipboard');
            }).catch((err) => {
                Logger.error('Metadata Tag QA Enhancements: failed to copy suggested changes', err);
            });
        });
        return btn;
    },

    buildTagToggles(innerContent, header, state) {
        const subsections = innerContent.querySelectorAll(':scope > .space-y-1');
        for (const subsection of subsections) {
            const label = subsection.querySelector('label');
            const tagContainer = subsection.querySelector('.flex.flex-wrap.gap-1');
            if (!label || !tagContainer) continue;

            const sectionKey = (label.textContent || '').trim();
            const isSingleSelect = SINGLE_SELECT_SECTIONS.includes(sectionKey);

            let workerSelectedCount = 0;
            const tagDivs = Array.from(tagContainer.children).filter(el => el.classList.contains('inline-flex') && el.classList.contains('rounded-md'));
            for (const tagEl of tagDivs) {
                const workerSelected = tagEl.classList.contains('bg-primary');
                if (workerSelected) workerSelectedCount++;
                const tagLabel = (tagEl.textContent || '').trim();
                if (!tagLabel) continue;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.setAttribute('data-fleet-plugin', this.id);
                btn.setAttribute('data-fleet-metadata-tag', '1');
                btn.setAttribute('data-section', sectionKey);
                btn.className = tagEl.className;
                btn.textContent = tagLabel;

                const item = { el: btn, workerSelected, qaToggled: false, sectionKey, tagLabel };
                state.tagState.push(item);

                btn.addEventListener('click', () => {
                    if (isSingleSelect && !item.workerSelected && !item.qaToggled) {
                        for (const o of state.tagState) {
                            if (o.sectionKey === sectionKey && o !== item && o.qaToggled && !o.workerSelected) {
                                o.qaToggled = false;
                                this.applyTagBorder(o);
                            }
                        }
                    }
                    item.qaToggled = !item.qaToggled;
                    this.applyTagBorder(item);
                    this.updateCopyButtonState(header, state);
                });

                tagEl.style.display = 'none';
                tagContainer.insertBefore(btn, tagEl.nextSibling);
            }

            if (workerSelectedCount === 0) {
                subsection.style.borderWidth = '2px';
                subsection.style.borderStyle = 'solid';
                subsection.style.borderColor = 'rgb(239, 68, 68)';
                subsection.style.borderRadius = '0.375rem';
            }
        }
    },

    applyTagBorder(item) {
        const { el, workerSelected, qaToggled } = item;
        el.style.borderWidth = '';
        el.style.borderStyle = '';
        el.style.borderColor = '';
        if (!qaToggled) return;
        el.style.borderWidth = '2px';
        el.style.borderStyle = 'solid';
        if (workerSelected) {
            el.style.borderColor = 'rgb(239, 68, 68)';
        } else {
            el.style.borderColor = 'rgb(34, 197, 94)';
        }
    },

    updateCopyButtonState(header, state) {
        const copyBtn = header.querySelector('[data-fleet-metadata-copy]');
        if (!copyBtn) return;
        const hasAny = state.tagState.some(t => t.qaToggled);
        copyBtn.disabled = !hasAny;
        if (hasAny) copyBtn.classList.remove(COPY_BTN_DISABLED_CLASS);
        else copyBtn.classList.add(COPY_BTN_DISABLED_CLASS);
    },

    buildCopyText(state) {
        const lines = ['Suggested metadata tag changes:'];
        const bySection = new Map();
        for (const t of state.tagState) {
            if (!t.qaToggled) continue;
            if (!bySection.has(t.sectionKey)) bySection.set(t.sectionKey, { deselect: [], select: [] });
            const sec = bySection.get(t.sectionKey);
            if (t.workerSelected) sec.deselect.push(t.tagLabel);
            else sec.select.push(t.tagLabel);
        }
        for (const [sectionKey, sec] of bySection) {
            if (sec.deselect.length === 0 && sec.select.length === 0) continue;
            lines.push(`[${sectionKey}]`);
            if (sec.deselect.length) {
                lines.push('Deselect:');
                sec.deselect.forEach(tag => lines.push(`[x] ${tag}`));
            }
            if (sec.select.length) {
                lines.push('Select:');
                sec.select.forEach(tag => lines.push(`[✔︎] ${tag}`));
            }
            lines.push('');
        }
        return lines.join('\n').replace(/\n+$/, '');
    },

    destroy() {
        if (this._pulseInterval) {
            clearInterval(this._pulseInterval);
            this._pulseInterval = null;
        }
    }
};
