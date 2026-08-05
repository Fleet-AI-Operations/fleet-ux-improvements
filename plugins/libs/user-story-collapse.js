// ============= user-story-collapse.js (library) =============
// Hide/Show User Story (or creation scenario) body from a right-aligned toggle on the label.

const SCOPE = '[data-fleet-user-story-collapse="1"]';
const CONTAINER_ATTR = 'data-fleet-user-story-collapse';
const TOGGLE_SLOT = 'user-story-collapse-toggle';
const HIDDEN_ATTR = 'data-fleet-user-story-section-hidden';
const SAVED_DISPLAY_ATTR = 'data-fleet-user-story-saved-display';
const OLD_HEADER_ATTR = 'data-fleet-user-story-header';
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
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return this.normalizeLabelText(clone.textContent) === LABEL_TEXT;
    },

    isScenarioIntro(el) {
        if (!el || el.tagName !== 'P') return false;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return SCENARIO_INTRO_RE.test(this.normalizeLabelText(clone.textContent));
    },

    isStoryBody(el) {
        if (!el || !el.getAttribute) return false;
        if (el.getAttribute(ORIGINAL_MARKER) === 'true') return true;
        if (el.getAttribute(REPLICA_MARKER) === 'true') return true;
        if (el.classList && el.classList.contains('whitespace-pre-wrap')) return true;
        return false;
    },

    collectBodiesInContainer(container, headerEl) {
        const bodies = [];
        if (!container) return bodies;
        for (const child of container.children) {
            if (child === headerEl) continue;
            if (child.querySelector && child.querySelector('[data-slot="' + TOGGLE_SLOT + '"]') && !this.isStoryBody(child)) {
                // skip leftover empty header wrappers
                if (child.getAttribute(OLD_HEADER_ATTR) === '1') continue;
            }
            if (child.getAttribute && child.getAttribute(OLD_HEADER_ATTR) === '1') continue;
            if (this.isStoryBody(child)) bodies.push(child);
        }
        return bodies;
    },

    findSections() {
        const seenParents = new Set();
        const sections = [];

        const labels = document.querySelectorAll('label, span');
        for (const label of labels) {
            if (!this.isUserStoryLabel(label)) continue;
            // Skip labels still stuck inside obsolete wrapper rows
            const parent = label.parentElement;
            if (!parent) continue;
            const container =
                parent.getAttribute && parent.getAttribute(OLD_HEADER_ATTR) === '1'
                    ? parent.parentElement
                    : parent;
            if (!container || seenParents.has(container)) continue;
            const bodies = this.collectBodiesInContainer(container, label);
            if (bodies.length === 0) continue;
            seenParents.add(container);
            sections.push({ kind: 'label', headerEl: label, container, bodies });
        }

        const intros = document.querySelectorAll('p');
        for (const intro of intros) {
            if (!this.isScenarioIntro(intro)) continue;
            const parent = intro.parentElement;
            if (!parent) continue;
            const container =
                parent.getAttribute && parent.getAttribute(OLD_HEADER_ATTR) === '1'
                    ? parent.parentElement
                    : parent;
            if (!container || seenParents.has(container)) continue;
            const bodies = this.collectBodiesInContainer(container, intro);
            if (bodies.length === 0) continue;
            seenParents.add(container);
            sections.push({ kind: 'scenario', headerEl: intro, container, bodies });
        }

        return sections;
    },

    cleanupOrphanHeaders(container) {
        if (!container) return;
        const orphans = container.querySelectorAll('[' + OLD_HEADER_ATTR + '="1"]');
        for (const row of orphans) {
            // Move any real label/intro back out, then remove the wrapper
            const keep = [];
            for (const child of Array.from(row.children)) {
                if (child.getAttribute && child.getAttribute('data-slot') === TOGGLE_SLOT) {
                    child.remove();
                    continue;
                }
                keep.push(child);
            }
            for (const child of keep) {
                container.insertBefore(child, row);
            }
            row.remove();
        }
    },

    isSectionHidden(bodies) {
        return bodies.some(
            (b) => b.getAttribute(HIDDEN_ATTR) === '1' || b.style.display === 'none'
        );
    },

    setBodiesHidden(bodies, hidden) {
        for (const body of bodies) {
            if (hidden) {
                if (!body.hasAttribute(SAVED_DISPLAY_ATTR)) {
                    body.setAttribute(SAVED_DISPLAY_ATTR, body.style.display || '');
                }
                body.style.display = 'none';
                body.setAttribute(HIDDEN_ATTR, '1');
            } else {
                const saved = body.getAttribute(SAVED_DISPLAY_ATTR);
                body.style.display = saved != null ? saved : '';
                body.removeAttribute(SAVED_DISPLAY_ATTR);
                body.removeAttribute(HIDDEN_ATTR);
            }
        }
    },

    applyHeaderLayout(headerEl) {
        headerEl.style.display = 'flex';
        headerEl.style.alignItems = 'center';
        headerEl.style.justifyContent = 'space-between';
        headerEl.style.width = '100%';
        headerEl.style.gap = '8px';
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
        btn.style.pointerEvents = 'auto';
        btn.style.position = 'relative';
        btn.style.zIndex = '2';
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show' : 'Hide';
        btn.textContent = label;
        btn.setAttribute('aria-label', hidden ? 'Show User Story' : 'Hide User Story');
        btn.title = btn.getAttribute('aria-label');
    },

    findToggleInContainer(container, logTag) {
        return (
            container.querySelector(
                '[data-fleet-plugin="' + logTag + '"][data-slot="' + TOGGLE_SLOT + '"]'
            ) || container.querySelector('[data-slot="' + TOGGLE_SLOT + '"]')
        );
    },

    ensureToggle(section, logTag) {
        const { headerEl, container } = section;
        if (!headerEl || !container) return;

        this.cleanupOrphanHeaders(container);
        container.setAttribute(CONTAINER_ATTR, '1');

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        // Re-resolve header if cleanup moved nodes
        let header = headerEl;
        if (!header.isConnected || !container.contains(header)) {
            header =
                Array.from(container.children).find(
                    (el) => this.isUserStoryLabel(el) || this.isScenarioIntro(el)
                ) || headerEl;
        }

        this.applyHeaderLayout(header);

        let btn = this.findToggleInContainer(container, logTag);
        const bodies = this.collectBodiesInContainer(container, header);
        const hidden = this.isSectionHidden(bodies);

        if (btn) {
            // Prefer button living on the live header
            if (btn.parentElement !== header && header.isConnected) {
                header.appendChild(btn);
            }
            this.applyToggleChrome(btn);
            this.syncToggleLabel(btn, hidden);
            if (hidden) this.setBodiesHidden(bodies, true);
            return;
        }

        btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fleet-plugin', logTag);
        btn.setAttribute('data-slot', TOGGLE_SLOT);
        this.applyToggleChrome(btn);
        this.syncToggleLabel(btn, hidden);

        const self = this;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveContainer =
                btn.closest('[' + CONTAINER_ATTR + '="1"]') || container;
            const liveHeader =
                Array.from(liveContainer.children).find(
                    (el) => self.isUserStoryLabel(el) || self.isScenarioIntro(el)
                ) || btn.parentElement;
            const liveBodies = self.collectBodiesInContainer(liveContainer, liveHeader);
            if (liveBodies.length === 0) {
                Logger.warn('click — no User Story bodies found in container');
                return;
            }
            const nowHidden = self.isSectionHidden(liveBodies);
            self.setBodiesHidden(liveBodies, !nowHidden);
            self.syncToggleLabel(btn, !nowHidden);
            self.applyToggleChrome(btn);
            Logger.log('User Story ' +
                    (!nowHidden ? 'hidden' : 'shown') +
                    ' (' +
                    liveBodies.length +
                    ' nodes)'
            );
        });

        header.appendChild(btn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(btn);
        }
        Logger.debug('Hide/Show control ready on User Story row');

        if (hidden) this.setBodiesHidden(bodies, true);
    },

    run(state, options) {
        const logTag = (options && (options.logTag || options.pluginId)) || this.id;
        const sections = this.findSections();

        if (sections.length === 0) {
            if (state.activationLogged) {
                Logger.debug('User Story sections gone — idle');
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('no User Story section yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        for (const section of sections) {
            this.ensureToggle(section, logTag);
        }

        if (!state.activationLogged) {
            Logger.log('User Story collapse active (' + sections.length + ' section(s))');
            state.activationLogged = true;
        }
    }
};

const plugin = {
    id: 'userStoryCollapseLib',
    name: 'User Story Collapse (library)',
    description: 'Shared API to hide/show User Story bodies from the label row',
    _version: '1.4',
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
            Logger.log('module registered (Context.userStoryCollapse)');
            state.registered = true;
        }
    }
};
