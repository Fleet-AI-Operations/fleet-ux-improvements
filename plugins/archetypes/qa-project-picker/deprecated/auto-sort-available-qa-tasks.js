
// ============= auto-sort-available-qa-tasks.js =============
const plugin = {
    id: 'autoSortAvailableQaTasks',
    name: 'Auto Sort Available QA Tasks',
    description: 'Automatically groups QA review environment cards by team (using labels shown on each card)',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',

    // Markup for task-creation-style collapsible section headings
    _headingMarkup: {
        teamIconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 text-muted-foreground"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        chevronSvg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current size-4 transition-all duration-200"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.7071 11.2929C14.8946 11.4804 15 11.7348 15 12C15 12.2652 14.8946 12.5196 14.7071 12.7071L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z"></path></svg>',
        buttonClass: 'whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-full flex justify-between rounded-md font-medium text-sm transition-all duration-200 overflow-hidden items-center px-3',
        countBadgeClass: 'inline-flex items-center whitespace-nowrap rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border border-brand-accent bg-brand text-white transition-colors py-0.5 h-4 px-1.5 text-[10px] font-medium'
    },

    // Style constants for card selection states
    _cardStyles: {
        unselected: {
            classes: 'bg-accent border-border hover:bg-card hover:border-border/80 hover:shadow-sm',
            removeClasses: 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-500/20 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/50'
        },
        selected: {
            classes: 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-500/20 shadow-sm hover:bg-blue-50 dark:hover:bg-blue-950/50',
            removeClasses: 'bg-accent border-border hover:bg-card hover:border-border/80 hover:shadow-sm'
        },
        checkmarkSvg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-6 w-6 text-blue-600 dark:text-blue-400"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM16.7071 10.2071C17.0976 9.81658 17.0976 9.18342 16.7071 8.79289C16.3166 8.40237 15.6834 8.40237 15.2929 8.79289L10 14.0858L8.70711 12.7929C8.31658 12.4024 7.68342 12.4024 7.29289 12.7929C6.90237 13.1834 6.90237 13.8166 7.29289 14.2071L9.29289 16.2071C9.68342 16.5976 10.3166 16.5976 10.7071 16.2071L16.7071 10.2071Z"></path></svg>'
    },

    initialState: {
        missingLogged: false,
        applied: false
    },

    onMutation(state, context) {
        const main = Context.dom.query('main', { context: `${this.id}.main` });
        if (!main) {
            if (!state.missingLogged) {
                Logger.debug('auto-sort-qa: main not found');
                state.missingLogged = true;
            }
            return;
        }

        // Verify we are on the QA Review - Select Environment page
        const pageHeader = main.querySelector('.text-lg.font-medium');
        if (!pageHeader || !pageHeader.textContent.includes('QA Review - Select Environment')) {
            if (state.applied) {
                const sortedContainer = main.querySelector('[data-wf-team-sorted]');
                if (sortedContainer) sortedContainer.remove();
                const grid = main.querySelector('.grid.grid-cols-1');
                if (grid) grid.style.display = '';
                state.applied = false;
                Logger.debug('auto-sort-qa: navigated away, state reset');
            }
            return;
        }

        // Locate the environment card grid
        const grid = main.querySelector('.grid.grid-cols-1');
        if (!grid || grid.children.length === 0) {
            if (!state.missingLogged) {
                Logger.debug('auto-sort-qa: grid not found or empty');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        // Identify the Teams combobox
        const comboboxes = Array.from(main.querySelectorAll('button[role="combobox"]'));
        const teamsDropdown = comboboxes[0] || null;
        const teamsText = teamsDropdown?.querySelector('span span')?.textContent.trim();

        // Grouped sort only applies when "All Teams" is selected
        if (teamsText !== 'All Teams') {
            if (state.applied) {
                const sortedContainer = main.querySelector('[data-wf-team-sorted]');
                if (sortedContainer) sortedContainer.remove();
                grid.style.display = '';
                state.applied = false;
                Logger.debug('auto-sort-qa: team filter changed, sort removed');
            }
            return;
        }

        // If sort is already applied, keep it in sync (selection state)
        if (state.applied) {
            const sortedContainer = main.querySelector('[data-wf-team-sorted]');
            if (sortedContainer) {
                if (grid.style.display !== 'none') {
                    grid.style.display = 'none';
                }
                this.syncSelectionState(grid, sortedContainer);
                return;
            }
            state.applied = false;
        }

        // Build grouping from labels on each card (no dropdown scan)
        const teamMap = this.buildGroupMapFromCards(grid);
        if (!teamMap || teamMap.size === 0) {
            Logger.debug('auto-sort-qa: no cards with labels found');
            return;
        }

        this.applySort(state, main, grid, teamMap);
    },

    /**
     * Read the group label from a card (e.g. "Task Designers - Computer Use Tasks").
     * Cards show this in the muted-foreground paragraph.
     */
    getCardLabel(card) {
        const p = card.querySelector('p.text-muted-foreground');
        return p ? p.textContent.trim() : '';
    },

    /**
     * Build a map of label -> card elements from the current grid.
     * Uses the label text already shown on each card.
     */
    buildGroupMapFromCards(grid) {
        const teamMap = new Map();
        for (const card of Array.from(grid.children)) {
            const h4 = card.querySelector('h4');
            if (!h4) continue;
            const label = this.getCardLabel(card);
            const key = label || 'Other';
            if (!teamMap.has(key)) teamMap.set(key, []);
            teamMap.get(key).push(card);
        }
        return teamMap;
    },

    getCardKey(card) {
        const h4 = card.querySelector('h4');
        const typeBadge = h4?.parentElement?.querySelector('span');
        return `${h4?.textContent.trim() ?? ''}|||${typeBadge ? typeBadge.textContent.trim() : ''}`;
    },

    // ── Selection styling helpers ────────────────────────────

    isCardSelected(card) {
        return card.classList.contains('border-blue-500');
    },

    applySelectedStyle(clone) {
        const styles = this._cardStyles;
        styles.unselected.classes.split(' ').forEach(cls => {
            if (cls) clone.classList.remove(cls);
        });
        styles.selected.classes.split(' ').forEach(cls => {
            if (cls) clone.classList.add(cls);
        });

        const headerRow = clone.querySelector('.flex.items-start.justify-between');
        if (headerRow && !clone.querySelector('[data-wf-checkmark]')) {
            const checkWrap = document.createElement('div');
            checkWrap.className = 'flex-shrink-0';
            checkWrap.setAttribute('data-wf-checkmark', 'true');
            checkWrap.innerHTML = styles.checkmarkSvg;
            headerRow.appendChild(checkWrap);
        }
    },

    applyUnselectedStyle(clone) {
        const styles = this._cardStyles;
        styles.selected.classes.split(' ').forEach(cls => {
            if (cls) clone.classList.remove(cls);
        });
        styles.unselected.classes.split(' ').forEach(cls => {
            if (cls) clone.classList.add(cls);
        });

        const checkmark = clone.querySelector('[data-wf-checkmark]');
        if (checkmark) checkmark.remove();
    },

    syncSelectionState(grid, sortedContainer) {
        const selectedKeys = new Set();
        for (const card of Array.from(grid.children)) {
            if (this.isCardSelected(card)) {
                selectedKeys.add(this.getCardKey(card));
            }
        }

        for (const clone of sortedContainer.querySelectorAll('[data-wf-card-key]')) {
            const key = clone.getAttribute('data-wf-card-key');
            if (selectedKeys.has(key)) {
                if (!this.isCardSelected(clone)) {
                    this.applySelectedStyle(clone);
                }
            } else {
                if (this.isCardSelected(clone)) {
                    this.applyUnselectedStyle(clone);
                }
            }
        }
    },

    // ── Apply: build team-grouped sections from card labels ──

    applySort(state, main, grid, teamMap) {
        if (!teamMap || teamMap.size === 0) return;

        const existing = main.querySelector('[data-wf-team-sorted]');
        if (existing) existing.remove();

        const markup = this._headingMarkup;
        const container = document.createElement('div');
        container.setAttribute('data-wf-team-sorted', 'true');
        container.className = 'space-y-4';

        let sectionCount = 0;

        for (const [label, cards] of teamMap) {
            if (cards.length === 0) continue;

            const sectionId = `wf-team-section-${sectionCount}`;
            const contentId = `wf-team-content-${sectionCount}`;

            const sectionWrapper = document.createElement('div');
            sectionWrapper.className = 'w-full space-y-3';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = markup.buttonClass;
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('aria-controls', contentId);
            btn.id = sectionId;

            const leftSpan = document.createElement('span');
            leftSpan.className = 'min-w-0 flex-1 overflow-hidden flex gap-2 items-center';
            const innerSpan = document.createElement('span');
            innerSpan.className = 'flex items-center gap-2';
            innerSpan.innerHTML = markup.teamIconSvg;
            const labelSpan = document.createElement('span');
            labelSpan.textContent = label;
            innerSpan.appendChild(labelSpan);
            leftSpan.appendChild(innerSpan);
            btn.appendChild(leftSpan);

            const rightSpan = document.createElement('span');
            rightSpan.className = 'flex gap-1.5 flex-shrink-0 items-center';
            const countBadge = document.createElement('div');
            countBadge.className = markup.countBadgeClass;
            countBadge.textContent = String(cards.length);
            rightSpan.appendChild(countBadge);
            const chevronWrap = document.createElement('span');
            chevronWrap.setAttribute('data-wf-chevron', 'true');
            chevronWrap.innerHTML = markup.chevronSvg;
            const chevronSvgEl = chevronWrap.querySelector('svg');
            if (chevronSvgEl) chevronSvgEl.classList.add('rotate-90');
            rightSpan.appendChild(chevronWrap);
            btn.appendChild(rightSpan);

            const contentWrapper = document.createElement('div');
            contentWrapper.id = contentId;
            contentWrapper.className = 'pt-4';
            contentWrapper.setAttribute('aria-labelledby', sectionId);

            const teamGrid = document.createElement('div');
            teamGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

            for (const card of cards) {
                const key = this.getCardKey(card);
                const clone = card.cloneNode(true);
                clone.setAttribute('data-wf-card-key', key);

                if (this.isCardSelected(card)) {
                    this.applySelectedStyle(clone);
                } else {
                    this.applyUnselectedStyle(clone);
                }

                clone.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    card.click();
                    setTimeout(() => {
                        if (container.isConnected && grid.isConnected) {
                            this.syncSelectionState(grid, container);
                        }
                    }, 50);
                });
                teamGrid.appendChild(clone);
            }

            contentWrapper.appendChild(teamGrid);
            sectionWrapper.appendChild(btn);
            sectionWrapper.appendChild(contentWrapper);

            btn.addEventListener('click', () => {
                contentWrapper.classList.toggle('hidden');
                const isExpanded = !contentWrapper.classList.contains('hidden');
                btn.setAttribute('aria-expanded', String(isExpanded));
                const svg = sectionWrapper.querySelector('[data-wf-chevron] svg');
                if (svg) {
                    if (isExpanded) {
                        svg.classList.add('rotate-90');
                    } else {
                        svg.classList.remove('rotate-90');
                    }
                }
            });

            container.appendChild(sectionWrapper);
            sectionCount++;
        }

        grid.style.display = 'none';
        grid.parentElement.insertBefore(container, grid.nextSibling);

        state.applied = true;
        Logger.log(`auto-sort-qa: organized into ${sectionCount} section(s) by card labels`);
    }
};
