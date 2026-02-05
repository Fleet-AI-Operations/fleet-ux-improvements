
// ============= auto-sort-available-qa-tasks.js =============
const plugin = {
    id: 'autoSortAvailableQaTasks',
    name: 'Auto Sort Available QA Tasks',
    description: 'Automatically groups QA review environment cards by team',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        scanning: false,
        teamMap: null,
        applied: false,
        lastLogTime: 0,
        scanFailedAt: 0
    },

    onMutation(state, context) {
        // Guard: ignore mutations triggered by our own scan cycling
        if (state.scanning) return;

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
            if (state.teamMap || state.applied) {
                state.teamMap = null;
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

        // Identify the two combobox dropdowns (Teams first, Types second)
        const comboboxes = Array.from(main.querySelectorAll('button[role="combobox"]'));
        const teamsDropdown = comboboxes[0] || null;
        const teamsText = teamsDropdown?.querySelector('span span')?.textContent.trim();

        // If the user has manually selected a specific team, back out and
        // show the native filtered view — our grouped sort only applies to "All Teams"
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

        // If sort is already applied, maintain it across React re-renders
        if (state.applied) {
            const sortedContainer = main.querySelector('[data-wf-team-sorted]');
            if (sortedContainer) {
                // Keep the original React-managed grid hidden
                if (grid.style.display !== 'none') {
                    grid.style.display = 'none';
                }
                return;
            }
            // Our container was removed by a React re-render, re-apply
            state.applied = false;
        }

        // If we already have team data from a previous scan, apply immediately
        if (state.teamMap) {
            this.applySort(state, main, grid);
            return;
        }

        // Nothing scanned yet — kick off the async scan (with cooldown after failures)
        if (!teamsDropdown) return;
        if (state.scanFailedAt && Date.now() - state.scanFailedAt < 10000) return;
        this.startScan(state, main, teamsDropdown, grid);
    },

    // ── Helpers ──────────────────────────────────────────────

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async waitForListbox(dropdown, maxWait = 2000) {
        const id = dropdown.getAttribute('aria-controls');
        if (!id) return null;
        
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const el = document.getElementById(id);
            if (el) return el;
            await this.wait(50);
        }
        return null;
    },

    openSelect(trigger) {
        // Radix Select listens for pointerdown to open, not click
        trigger.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerType: 'mouse'
        }));
    },

    dispatchKey(target, key) {
        // Radix Select content handles keydown for navigation and confirmation
        target.dispatchEvent(new KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true
        }));
    },

    throttledLog(state, level, message, throttleMs = 5000) {
        const now = Date.now();
        if (now - state.lastLogTime < throttleMs) return;
        state.lastLogTime = now;
        if (level === 'error') {
            Logger.error(message);
        } else if (level === 'debug') {
            Logger.debug(message);
        } else {
            Logger.log(message);
        }
    },

    readCards(grid) {
        const cards = [];
        for (const child of grid.children) {
            const h4 = child.querySelector('h4');
            if (!h4) continue;
            const typeBadge = h4.parentElement.querySelector('span');
            cards.push({
                name: h4.textContent.trim(),
                type: typeBadge ? typeBadge.textContent.trim() : ''
            });
        }
        return cards;
    },

    // ── Scan: cycle through every team option in the dropdown ──

    async startScan(state, main, dropdown, grid) {
        state.scanning = true;
        Logger.log('auto-sort-qa: scanning teams…');

        // Visually hide the grid during the scan so the user doesn't see
        // cards flickering as we cycle filters
        const origStyles = {
            visibility: grid.style.visibility,
            height:     grid.style.height,
            overflow:   grid.style.overflow
        };
        grid.style.visibility = 'hidden';
        grid.style.height     = '0';
        grid.style.overflow   = 'hidden';

        // Friendly loading message in place of the grid
        const scanMsg = document.createElement('div');
        scanMsg.setAttribute('data-wf-scan-msg', 'true');
        scanMsg.style.cssText =
            'padding: 2rem; text-align: center; color: var(--muted-foreground, #888); font-size: 0.875rem;';
        scanMsg.textContent = 'Sorting environments by team…';
        grid.parentElement.insertBefore(scanMsg, grid);

        try {
            const teamMap = {};

            // Helper: open dropdown → wait for listbox → press ArrowDown
            // once to advance to next option → Enter to confirm selection
            const advanceAndSelect = async () => {
                this.openSelect(dropdown);
                await this.wait(150);
                const lb = await this.waitForListbox(dropdown);
                if (!lb) return false;
                await this.wait(100);
                this.dispatchKey(lb, 'ArrowDown');
                await this.wait(100);
                this.dispatchKey(lb, 'Enter');
                await this.wait(500);
                return true;
            };

            // 1. Open the dropdown to read all available team names
            this.openSelect(dropdown);
            await this.wait(150);
            const listbox = await this.waitForListbox(dropdown);
            if (!listbox) {
                this.throttledLog(state, 'error', 'auto-sort-qa: listbox not found after waiting');
                state.scanFailedAt = Date.now();
                return;
            }

            await this.wait(100);
            const teamNames = Array.from(listbox.querySelectorAll('[role="option"]'))
                .map(o => o.textContent.trim())
                .filter(t => t !== 'All Teams');

            if (teamNames.length === 0) {
                Logger.debug('auto-sort-qa: no team options found in dropdown');
                this.dispatchKey(listbox, 'Escape');
                state.scanFailedAt = Date.now();
                return;
            }

            // 2. From the already-open listbox (on "All Teams"), ArrowDown
            //    moves highlight to first team, Enter confirms
            this.dispatchKey(listbox, 'ArrowDown');
            await this.wait(100);
            this.dispatchKey(listbox, 'Enter');
            await this.wait(500);
            teamMap[teamNames[0]] = this.readCards(grid);

            // 3. Each subsequent open → ArrowDown advances one more team
            for (let i = 1; i < teamNames.length; i++) {
                if (!grid.isConnected) break;
                const ok = await advanceAndSelect();
                if (!ok) break;
                teamMap[teamNames[i]] = this.readCards(grid);
            }

            // 4. Restore "All Teams": open → Home jumps to top → Enter confirms
            if (grid.isConnected) {
                this.openSelect(dropdown);
                await this.wait(150);
                const lb = await this.waitForListbox(dropdown);
                if (lb) {
                    await this.wait(100);
                    this.dispatchKey(lb, 'Home');
                    await this.wait(100);
                    this.dispatchKey(lb, 'Enter');
                    await this.wait(500);
                }
            }

            state.teamMap = teamMap;
            state.scanFailedAt = 0;
            Logger.log(
                `auto-sort-qa: mapped ${Object.keys(teamMap).length} team(s): ` +
                Object.entries(teamMap).map(([t, c]) => `${t} (${c.length})`).join(', ')
            );

        } catch (err) {
            Logger.error('auto-sort-qa: scan failed:', err);
        } finally {
            // Tear down scanning UI
            if (scanMsg.isConnected) scanMsg.remove();
            state.scanning = false;

            if (state.teamMap && grid.isConnected) {
                // Go straight from scan-hidden → sort-hidden (no visible flash)
                this.applySort(state, main, grid);
                // Now the grid uses display:none; clean up scan-phase styles
                grid.style.visibility = origStyles.visibility;
                grid.style.height     = origStyles.height;
                grid.style.overflow   = origStyles.overflow;
            } else {
                // No sort to apply — just restore the grid
                grid.style.visibility = origStyles.visibility;
                grid.style.height     = origStyles.height;
                grid.style.overflow   = origStyles.overflow;
            }
        }
    },

    // ── Apply: build team-grouped sections from cached scan data ──

    applySort(state, main, grid) {
        if (!state.teamMap || Object.keys(state.teamMap).length === 0) return;

        // Clean up any previous sorted container (e.g. on re-apply after React re-render)
        const existing = main.querySelector('[data-wf-team-sorted]');
        if (existing) existing.remove();

        // Build lookup from current grid:  compositeKey → [element, …]
        // Key uses name + type to handle duplicate environment names (e.g. RevOps
        // appears as both "Computer Use" and "Tool Use")
        const cardsByKey = new Map();
        for (const card of Array.from(grid.children)) {
            const h4 = card.querySelector('h4');
            if (!h4) continue;
            const typeBadge = h4.parentElement.querySelector('span');
            const key = `${h4.textContent.trim()}|||${typeBadge ? typeBadge.textContent.trim() : ''}`;
            if (!cardsByKey.has(key)) cardsByKey.set(key, []);
            cardsByKey.get(key).push(card);
        }

        // Container we control — lives outside React's tree
        const container = document.createElement('div');
        container.setAttribute('data-wf-team-sorted', 'true');

        const placed = new Set();
        let sectionCount = 0;

        for (const [teamName, cardInfos] of Object.entries(state.teamMap)) {
            if (cardInfos.length === 0) continue;

            // Section header
            const header = document.createElement('h3');
            header.textContent = teamName;
            header.style.cssText =
                'font-size: 1rem; font-weight: 600; color: var(--foreground, #111);';
            header.style.marginTop    = sectionCount > 0 ? '1.5rem' : '0';
            header.style.marginBottom = '0.75rem';

            // Grid that mirrors the original layout
            const teamGrid = document.createElement('div');
            teamGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

            for (const info of cardInfos) {
                const key = `${info.name}|||${info.type}`;
                const candidates = cardsByKey.get(key);
                if (!candidates) continue;

                // Pick the first un-placed original with this key
                const original = candidates.find(c => !placed.has(c));
                if (!original) continue;
                placed.add(original);

                // Deep-clone for display; forward clicks to the hidden React original
                // so React's synthetic event system and router navigation stay intact
                const clone = original.cloneNode(true);
                clone.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    original.click();
                });
                teamGrid.appendChild(clone);
            }

            if (teamGrid.children.length > 0) {
                container.appendChild(header);
                container.appendChild(teamGrid);
                sectionCount++;
            }
        }

        // Safety net: surface any cards that weren't in any team mapping
        const unplaced = Array.from(grid.children)
            .filter(c => c.querySelector('h4') && !placed.has(c));

        if (unplaced.length > 0) {
            const header = document.createElement('h3');
            header.textContent = 'Other';
            header.style.cssText =
                'font-size: 1rem; font-weight: 600; color: var(--foreground, #111);';
            header.style.marginTop    = sectionCount > 0 ? '1.5rem' : '0';
            header.style.marginBottom = '0.75rem';
            container.appendChild(header);

            const otherGrid = document.createElement('div');
            otherGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
            for (const card of unplaced) {
                const clone = card.cloneNode(true);
                clone.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    card.click();
                });
                otherGrid.appendChild(clone);
            }
            container.appendChild(otherGrid);
        }

        // Hide React's grid (don't remove it — React still owns it)
        grid.style.display = 'none';
        // Insert our container as a sibling so it renders in the same slot
        grid.parentElement.insertBefore(container, grid.nextSibling);

        state.applied = true;
        Logger.log(`auto-sort-qa: organized into ${sectionCount} team section(s)`);
    }
};
