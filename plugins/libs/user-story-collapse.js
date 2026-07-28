// ============= user-story-collapse.js (library) =============
// Hide/Show User Story (or creation scenario) body from a right-aligned toggle on the label row.

const SCOPE = '[data-fleet-user-story-collapse="1"]';
const SECTION_ATTR = 'data-fleet-user-story-collapse';
const TOGGLE_SLOT = 'user-story-collapse-toggle';
const HIDDEN_ATTR = 'data-fleet-user-story-section-hidden';
const LABEL_TEXT = 'User Story';
const SCENARIO_INTRO_RE = /Write a problem inspired by the following scenario/i;
const ORIGINAL_MARKER = 'data-fleet-user-story-original';
const REPLICA_MARKER = 'data-fleet-user-story-replica';

const UserStoryCollapseApi = {
    id: 'userStoryCollapse',
    normalizeLabelText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    isUserStoryLabel(el) {
        if (!el) return false;
        // Exact label text only (ignore our injected button text if already present)
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return this.normalizeLabelText(clone.textContent) === LABEL_TEXT;
    },

    collectBodiesAfter(headerEl) {
        const bodies = [];
        let sibling = headerEl.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute('data-fleet-user-story-header') === '1') {
                break;
            }
            const isOriginal = sibling.getAttribute && sibling.getAttribute(ORIGINAL_MARKER) === 'true';
            const isReplica = sibling.getAttribute && sibling.getAttribute(REPLICA_MARKER) === 'true';
            const isStory =
                isOriginal ||
                isReplica ||
                (sibling.classList && sibling.classList.contains('whitespace-pre-wrap'));
            if (isStory) bodies.push(sibling);
            sibling = sibling.nextElementSibling;
        }
        return bodies;
    },

    findLabelSections() {
        const sections = [];
        const labels = document.querySelectorAll('label, span');
        for (const label of labels) {
            if (!this.isUserStoryLabel(label)) continue;
            const anchor =
                label.closest('[data-fleet-user-story-header="1"]') || label;
            const bodies = this.collectBodiesAfter(anchor);
            if (bodies.length === 0) continue;
            sections.push({ kind: 'label', headerEl: label, bodies });
        }
        return sections;
    },

    findCreationScenarioSections() {
        const sections = [];
        const intros = document.querySelectorAll('p');
        for (const intro of intros) {
            if (!SCENARIO_INTRO_RE.test(this.normalizeLabelText(intro.textContent))) continue;
            const bodies = this.collectBodiesForHeader(intro, 'scenario');
            if (bodies.length === 0) continue;
            sections.push({ kind: 'scenario', headerEl: intro, bodies });
        }
        return sections;
    },

    findSections() {
        return this.findLabelSections().concat(this.findCreationScenarioSections());
    },

    isSectionHidden(bodies) {
        return bodies.some(
            (b) =>
                b.getAttribute(HIDDEN_ATTR) === '1' ||
                b.style.display === 'none'
        );
    },

    setBodiesHidden(bodies, hidden) {
        for (const body of bodies) {
            if (hidden) {
                if (!body.hasAttribute('data-fleet-user-story-saved-display')) {
                    body.setAttribute(
                        'data-fleet-user-story-saved-display',
                        body.style.display || ''
                    );
                }
                body.style.display = 'none';
                body.setAttribute(HIDDEN_ATTR, '1');
            } else {
                const saved = body.getAttribute('data-fleet-user-story-saved-display');
                body.style.display = saved != null ? saved : '';
                body.removeAttribute('data-fleet-user-story-saved-display');
                body.removeAttribute(HIDDEN_ATTR);
            }
        }
    },

    ensureHeaderRow(section) {
        const { headerEl, kind } = section;
        const parent = headerEl.parentElement;
        if (!parent) return null;

        let row = parent.querySelector(':scope > [data-fleet-user-story-header="1"]');
        if (row && row.contains(headerEl)) return row;

        row = document.createElement('div');
        row.setAttribute('data-fleet-user-story-header', '1');
        row.setAttribute(SECTION_ATTR, '1');
        row.className = 'flex items-center justify-between gap-2 w-full';
        if (kind === 'label') {
            row.classList.add('mb-2');
            headerEl.classList.remove('mb-2');
            headerEl.style.marginBottom = '0';
        } else {
            row.classList.add('mb-0');
        }
        parent.insertBefore(row, headerEl);
        row.appendChild(headerEl);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(row);
        }
        return row;
    },

    applyToggleChrome(btn) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            btn.className = Context.uiLib.btnClass('basic', 'compact');
        } else {
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium h-7 text-xs pl-2 pr-2 py-1';
        }
        btn.style.flexShrink = '0';
        btn.style.marginLeft = 'auto';
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show' : 'Hide';
        btn.textContent = label;
        btn.setAttribute('aria-label', hidden ? 'Show User Story' : 'Hide User Story');
        btn.title = btn.getAttribute('aria-label');
    },

    ensureToggle(section, state, logTag) {
        const row = this.ensureHeaderRow(section);
        if (!row) return;

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        let btn = row.querySelector(
            '[data-fleet-plugin="' +
                logTag +
                '"][data-slot="' +
                TOGGLE_SLOT +
                '"]'
        );
        const hidden = this.isSectionHidden(section.bodies);

        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-fleet-plugin', logTag);
            btn.setAttribute('data-slot', TOGGLE_SLOT);
            this.applyToggleChrome(btn);

            const self = this;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const liveBodies = self.collectBodiesForHeader(section.headerEl, section.kind);
                const nowHidden = self.isSectionHidden(liveBodies);
                self.setBodiesHidden(liveBodies, !nowHidden);
                self.syncToggleLabel(btn, !nowHidden);
                self.applyToggleChrome(btn);
                Logger.log(
                    logTag +
                        ': User Story ' +
                        (!nowHidden ? 'hidden' : 'shown') +
                        ' (' +
                        liveBodies.length +
                        ' nodes)'
                );
            });

            row.appendChild(btn);
            if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
                CleanupRegistry.registerElement(btn);
            }
            Logger.log(logTag + ': Hide/Show control ready on User Story row');
        }

        // Re-apply collapse if markdown replica appeared while hidden
        if (hidden) {
            this.setBodiesHidden(section.bodies, true);
        }
        this.applyToggleChrome(btn);
        this.syncToggleLabel(btn, hidden);
    },

    collectBodiesForHeader(headerEl, kind) {
        if (kind === 'scenario') {
            const parent = headerEl.parentElement;
            if (!parent) return [];
            // header may now sit inside the header row
            const scopeParent =
                headerEl.closest('[data-fleet-user-story-header="1"]')?.parentElement || parent;
            const bodies = [];
            for (const child of scopeParent.children) {
                if (child.getAttribute && child.getAttribute('data-fleet-user-story-header') === '1') {
                    continue;
                }
                const isOriginal = child.getAttribute && child.getAttribute(ORIGINAL_MARKER) === 'true';
                const isReplica = child.getAttribute && child.getAttribute(REPLICA_MARKER) === 'true';
                const isStory =
                    isOriginal ||
                    isReplica ||
                    (child.classList && child.classList.contains('whitespace-pre-wrap'));
                if (isStory) bodies.push(child);
            }
            return bodies;
        }

        // label: bodies are siblings after the header row (or after label if not wrapped)
        const row = headerEl.closest('[data-fleet-user-story-header="1"]');
        const anchor = row || headerEl;
        return this.collectBodiesAfter(anchor);
    },

    run(state, options) {
        const logTag = (options && (options.logTag || options.pluginId)) || this.id;
        const sections = this.findSections();

        if (sections.length === 0) {
            if (state.activationLogged) {
                Logger.debug(logTag + ': User Story sections gone — idle');
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(logTag + ': no User Story section yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        for (const section of sections) {
            // Refresh bodies relative to current header placement
            section.bodies = this.collectBodiesForHeader(section.headerEl, section.kind);
            if (section.bodies.length === 0) continue;
            this.ensureToggle(section, state, logTag);
        }

        if (!state.activationLogged) {
            Logger.log(logTag + ': User Story collapse active (' + sections.length + ' section(s))');
            state.activationLogged = true;
        }
    }
};

const plugin = {
    id: 'userStoryCollapseLib',
    name: 'User Story Collapse (library)',
    description: 'Shared API to hide/show User Story bodies from the label row',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.userStoryCollapse = {
            run: (s, options) => {
                const impl = Object.create(UserStoryCollapseApi);
                if (options && options.pluginId) impl.id = options.pluginId;
                return UserStoryCollapseApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('userStoryCollapseLib: module registered (Context.userStoryCollapse)');
            state.registered = true;
        }
    }
};
