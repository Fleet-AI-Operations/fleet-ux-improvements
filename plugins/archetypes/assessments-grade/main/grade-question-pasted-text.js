// ============= grade-question-pasted-text.js =============
// Archetype: assessments-grade — inject per-question pasted clipboard text into grading sections.

const STYLE_ID = 'fleet-assessments-grade-paste-diff-style';
const ROOT_ATTR = 'data-fleet-grade-pasted-text';
const PASTE_SUMMARY_RE = /^paste on #(\d+) · (\d+) chars · /;

const plugin = {
    id: 'assessmentsGradeQuestionPastedText',
    name: 'Grade Question Pasted Text',
    description:
        'Shows clipboard paste events per question in grading sections, with diff vs applicant answer on the last paste',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        stylesInjected: false,
        activationLogged: false,
        sectionsInjected: 0
    },
    storageKeys: {
        granularity: 'assessments-grade-paste-diff-granularity'
    },
    sectionUi: new WeakMap(),

    init(state) {
        this.ensureDiffStyles(state);
    },

    onMutation(state) {
        this.ensureDiffStyles(state);
        const pastesByQuestion = this.scrapePastesByQuestion();
        if (pastesByQuestion.size === 0) {
            this.removeOrphanRoots(pastesByQuestion);
            return;
        }

        let injectedThisPass = 0;
        for (const section of document.querySelectorAll('section[id^="grading-q-"]')) {
            const questionNum = this.getQuestionNumber(section);
            if (questionNum == null) {
                continue;
            }
            const pastes = pastesByQuestion.get(questionNum);
            if (!pastes || pastes.length === 0) {
                this.removeRoot(section);
                continue;
            }
            const applicantAnswer = this.getApplicantAnswerText(section);
            if (this.syncSection(section, questionNum, pastes, applicantAnswer, state)) {
                injectedThisPass += 1;
            }
        }

        this.removeOrphanRoots(pastesByQuestion);

        if (injectedThisPass > 0 && !state.activationLogged) {
            Logger.info(
                `${this.id}: pasted-text blocks active for ${injectedThisPass} question section(s)`
            );
            state.activationLogged = true;
        }
    },

    ensureDiffStyles(state) {
        if (state.stylesInjected || document.getElementById(STYLE_ID)) {
            state.stylesInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = `
            [${ROOT_ATTR}] pre .diff-highlight-remove,
            [${ROOT_ATTR}] pre span[style*="239, 68, 68"] {
                background-color: rgba(239, 68, 68, 0.35) !important;
                color: rgb(127, 29, 29) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark [${ROOT_ATTR}] pre .diff-highlight-remove,
            .dark [${ROOT_ATTR}] pre span[style*="239, 68, 68"] {
                color: rgb(254, 202, 202) !important;
            }
            [${ROOT_ATTR}] pre .diff-highlight-add,
            [${ROOT_ATTR}] pre span[style*="16, 185, 129"] {
                background-color: rgba(16, 185, 129, 0.35) !important;
                color: rgb(6, 78, 59) !important;
                border-radius: 3px;
                box-decoration-break: clone;
                -webkit-box-decoration-break: clone;
            }
            .dark [${ROOT_ATTR}] pre .diff-highlight-add,
            .dark [${ROOT_ATTR}] pre span[style*="16, 185, 129"] {
                color: rgb(167, 243, 208) !important;
            }
            [${ROOT_ATTR}] pre .diff-newline-marker {
                opacity: 0.6;
                font-weight: bold;
            }
            [${ROOT_ATTR}] .fleet-paste-no-diff-badge {
                display: inline-flex;
                align-items: center;
                border-radius: 4px;
                border: 1px solid rgb(239, 68, 68);
                background: rgb(254, 242, 242);
                color: rgb(185, 28, 28);
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.04em;
                padding: 2px 6px;
                line-height: 1.2;
                white-space: nowrap;
            }
            .dark [${ROOT_ATTR}] .fleet-paste-no-diff-badge {
                background: rgba(127, 29, 29, 0.35);
                color: rgb(254, 202, 202);
                border-color: rgb(185, 28, 28);
            }
            [${ROOT_ATTR}] .fleet-paste-diff-controls {
                display: inline-flex;
                align-items: center;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 8px;
            }
            [${ROOT_ATTR}] .fleet-paste-diff-toggle-label {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-weight: 500;
                color: var(--foreground, #333);
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
            }
            [${ROOT_ATTR}] .fleet-paste-diff-granularity {
                display: inline-flex;
                align-items: center;
                border-radius: 6px;
                overflow: hidden;
                border: 1px solid var(--border, #e2e2e2);
                background: var(--muted, rgba(0,0,0,0.04));
            }
            [${ROOT_ATTR}] .fleet-paste-diff-granularity-btn {
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                border-right: 1px solid var(--border, #e2e2e2);
                background: transparent;
                color: var(--muted-foreground, #888);
                line-height: 1.3;
            }
            [${ROOT_ATTR}] .fleet-paste-diff-granularity-btn:last-child {
                border-right: none;
            }
            [${ROOT_ATTR}] .fleet-paste-diff-granularity-btn[aria-pressed="true"] {
                background-color: var(--primary, #4f46e5);
                color: var(--primary-foreground, #fff);
            }
        `;
        document.head.appendChild(style);
        state.stylesInjected = true;
        Logger.debug(`${this.id}: diff highlight styles injected`);
    },

    formatDuration(totalSeconds) {
        const sec = Math.max(0, Math.floor(Number(totalSeconds)) || 0);
        const minutes = Math.floor(sec / 60);
        const seconds = sec % 60;
        return `${minutes}m, ${seconds}s`;
    },

    parsePasteSummary(text) {
        const trimmed = (text || '').trim();
        if (!PASTE_SUMMARY_RE.test(trimmed)) {
            return null;
        }
        const questionNum = parseInt(trimmed.match(PASTE_SUMMARY_RE)[1], 10);
        const rawSec = trimmed.match(/\+(\d+)s$/);
        if (rawSec) {
            return { questionNum, seconds: parseInt(rawSec[1], 10) };
        }
        const atMatch = trimmed.match(/at (\d+)m, (\d+)s/);
        if (atMatch) {
            return {
                questionNum,
                seconds: parseInt(atMatch[1], 10) * 60 + parseInt(atMatch[2], 10)
            };
        }
        return null;
    },

    scrapePastesByQuestion() {
        const byQuestion = new Map();
        const cards = document.querySelectorAll('.rounded-md.border.bg-background.px-2.py-1.5');
        for (const card of cards) {
            const summary = card.querySelector(':scope > div:first-child');
            const pre = card.querySelector('pre');
            if (!summary || !pre) {
                continue;
            }
            const parsed = this.parsePasteSummary(summary.textContent);
            if (!parsed) {
                continue;
            }
            const pastedText = (pre.textContent || '').trimEnd();
            const list = byQuestion.get(parsed.questionNum) || [];
            const prevOnQuestion = list.length > 0 ? list[list.length - 1].seconds : null;
            const timeLabel = this.buildTimeLabel(parsed.seconds, prevOnQuestion);
            list.push({
                seconds: parsed.seconds,
                text: pastedText,
                timeLabel
            });
            byQuestion.set(parsed.questionNum, list);
        }
        return byQuestion;
    },

    buildTimeLabel(seconds, previousSecondsOnQuestion) {
        let label = this.formatDuration(seconds);
        if (previousSecondsOnQuestion != null) {
            const delta = Math.max(0, seconds - previousSecondsOnQuestion);
            label += ` · Δ${this.formatDuration(delta)}`;
        }
        return label;
    },

    getQuestionNumber(section) {
        const header = section.querySelector('.text-sm.font-medium');
        if (!header) {
            return null;
        }
        const match = header.textContent.match(/Question\s+(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    },

    findApplicantAnswerBlock(section) {
        const labels = section.querySelectorAll(
            '.mb-1.text-xs.font-medium.uppercase.tracking-wide'
        );
        for (const label of labels) {
            if (label.textContent.trim() === "Applicant's answer") {
                return label.parentElement;
            }
        }
        return null;
    },

    getApplicantAnswerText(section) {
        const block = this.findApplicantAnswerBlock(section);
        if (!block) {
            return '';
        }
        const answerEl = block.querySelector(
            '.whitespace-pre-wrap.rounded-md.border.px-3.py-2.text-sm'
        );
        return answerEl ? (answerEl.textContent || '').trimEnd() : '';
    },

    buildSignature(questionNum, pastes, applicantAnswer) {
        const pasteSig = pastes.map((p) => `${p.seconds}:${p.text.length}:${p.text.slice(0, 32)}`).join('|');
        return `${questionNum}|${pasteSig}|${applicantAnswer.length}:${applicantAnswer.slice(0, 64)}`;
    },

    getSectionUi(root) {
        let ui = this.sectionUi.get(root);
        if (!ui) {
            ui = {
                highlightsEnabled: true,
                diffGranularity: Storage.get(this.storageKeys.granularity, 'word')
            };
            this.sectionUi.set(root, ui);
        }
        return ui;
    },

    syncSection(section, questionNum, pastes, applicantAnswer, state) {
        const anchor = this.findApplicantAnswerBlock(section);
        if (!anchor) {
            return false;
        }

        const signature = this.buildSignature(questionNum, pastes, applicantAnswer);
        let root = section.querySelector(`[${ROOT_ATTR}]`);
        if (root && root.dataset.fleetPasteSig === signature) {
            return true;
        }

        if (!root) {
            root = document.createElement('div');
            root.setAttribute(ROOT_ATTR, 'true');
            root.setAttribute('data-fleet-plugin', this.id);
            root.className = 'space-y-2';
            anchor.parentElement.insertBefore(root, anchor);
        }

        root.dataset.fleetPasteSig = signature;
        const ui = this.getSectionUi(root);
        const lastPaste = pastes[pastes.length - 1];
        const noDifference = lastPaste.text.trim() === applicantAnswer.trim();

        root.replaceChildren();
        root.appendChild(this.buildHeader(root, ui, noDifference));
        root.appendChild(this.buildPasteBlocks(root, pastes, applicantAnswer, ui, noDifference));

        Logger.debug(
            `${this.id}: synced Q${questionNum} — ${pastes.length} paste(s)${noDifference ? ', no difference' : ''}`
        );
        return true;
    },

    buildHeader(root, ui, noDifference) {
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';

        const title = document.createElement('div');
        title.className =
            'text-xs font-medium uppercase tracking-wide text-muted-foreground';
        title.textContent = 'Pasted Text';
        header.appendChild(title);

        const controls = document.createElement('div');
        controls.className = 'fleet-paste-diff-controls';

        if (noDifference) {
            const badge = document.createElement('span');
            badge.className = 'fleet-paste-no-diff-badge';
            badge.textContent = 'NO DIFFERENCE';
            controls.appendChild(badge);
        }

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'fleet-paste-diff-toggle-label';
        const toggleId = `${this.id}-toggle-${Math.random().toString(36).slice(2, 9)}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = toggleId;
        checkbox.checked = ui.highlightsEnabled;
        const toggleText = document.createElement('span');
        toggleText.textContent = 'Highlight Differences';
        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(toggleText);
        controls.appendChild(toggleLabel);

        const granGroup = document.createElement('div');
        granGroup.className = 'fleet-paste-diff-granularity';
        const wordBtn = this.createGranularityButton('Word', ui.diffGranularity === 'word');
        const charBtn = this.createGranularityButton('Character', ui.diffGranularity === 'char');
        granGroup.appendChild(wordBtn);
        granGroup.appendChild(charBtn);
        controls.appendChild(granGroup);

        header.appendChild(controls);

        const refreshDiff = () => {
            const diffHost = root.querySelector('[data-fleet-paste-diff-host="true"]');
            if (!diffHost) {
                return;
            }
            const beforePre = diffHost.querySelector('[data-fleet-paste-diff-before="true"]');
            const afterPre = diffHost.querySelector('[data-fleet-paste-diff-after="true"]');
            if (!beforePre || !afterPre) {
                return;
            }
            const beforeText = beforePre.dataset.originalText || '';
            const afterText = afterPre.dataset.originalText || '';
            this.renderDiffPair(beforePre, afterPre, beforeText, afterText, ui);
        };

        checkbox.addEventListener('change', () => {
            ui.highlightsEnabled = checkbox.checked;
            Logger.log(
                `${this.id}: highlight differences ${ui.highlightsEnabled ? 'on' : 'off'}`
            );
            refreshDiff();
        });

        const setGranularity = (granularity) => {
            if (ui.diffGranularity === granularity) {
                return;
            }
            ui.diffGranularity = granularity;
            Storage.set(this.storageKeys.granularity, granularity);
            wordBtn.setAttribute('aria-pressed', granularity === 'word' ? 'true' : 'false');
            charBtn.setAttribute('aria-pressed', granularity === 'char' ? 'true' : 'false');
            Logger.log(`${this.id}: diff granularity ${granularity}`);
            refreshDiff();
        };

        wordBtn.addEventListener('click', () => setGranularity('word'));
        charBtn.addEventListener('click', () => setGranularity('char'));

        return header;
    },

    createGranularityButton(label, pressed) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fleet-paste-diff-granularity-btn';
        btn.textContent = label;
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        return btn;
    },

    buildPasteBlocks(root, pastes, applicantAnswer, ui, noDifference) {
        const container = document.createElement('div');
        container.className = 'space-y-2';

        pastes.forEach((paste, index) => {
            const isLast = index === pastes.length - 1;
            const block = document.createElement('div');
            block.className = 'rounded-md border bg-muted/20 px-3 py-2 text-sm';

            const label = document.createElement('div');
            label.className = 'mb-1 font-mono text-xs tabular-nums text-muted-foreground';
            label.textContent = paste.timeLabel;
            block.appendChild(label);

            if (isLast) {
                block.appendChild(
                    this.buildDiffGrid(paste.text, applicantAnswer, ui, noDifference)
                );
            } else {
                block.appendChild(this.buildPlainPre(paste.text));
            }

            container.appendChild(block);
        });

        return container;
    },

    buildPlainPre(text) {
        const pre = document.createElement('pre');
        pre.className =
            'bg-muted/30 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 font-mono text-[11px] leading-4 text-foreground';
        pre.textContent = text;
        return pre;
    },

    buildDiffGrid(pasteText, applicantAnswer, ui, noDifference) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 gap-2 sm:grid-cols-2';
        grid.setAttribute('data-fleet-paste-diff-host', 'true');

        const beforeCol = document.createElement('div');
        const beforeLabel = document.createElement('div');
        beforeLabel.className = 'mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
        beforeLabel.textContent = 'Last paste';
        const beforePre = this.buildPlainPre(pasteText);
        beforePre.setAttribute('data-fleet-paste-diff-before', 'true');
        beforeCol.appendChild(beforeLabel);
        beforeCol.appendChild(beforePre);

        const afterCol = document.createElement('div');
        const afterLabel = document.createElement('div');
        afterLabel.className = 'mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
        afterLabel.textContent = "Applicant's answer";
        const afterPre = this.buildPlainPre(applicantAnswer);
        afterPre.setAttribute('data-fleet-paste-diff-after', 'true');
        afterCol.appendChild(afterLabel);
        afterCol.appendChild(afterPre);

        grid.appendChild(beforeCol);
        grid.appendChild(afterCol);

        beforePre.dataset.originalText = pasteText;
        afterPre.dataset.originalText = applicantAnswer;
        this.renderDiffPair(beforePre, afterPre, pasteText, applicantAnswer, ui);

        if (noDifference) {
            grid.setAttribute('data-fleet-paste-no-diff', 'true');
        }

        return grid;
    },

    renderDiffPair(beforePre, afterPre, beforeText, afterText, ui) {
        beforePre.dataset.originalText = beforeText;
        afterPre.dataset.originalText = afterText;

        if (!ui.highlightsEnabled) {
            beforePre.textContent = beforeText;
            afterPre.textContent = afterText;
            delete beforePre.dataset.diffHighlighted;
            delete afterPre.dataset.diffHighlighted;
            return;
        }

        const granularity = ui.diffGranularity || 'word';
        const diff =
            granularity === 'char'
                ? this.computeCharDiff(beforeText, afterText)
                : this.computeDiff(beforeText, afterText);
        const isDark = document.documentElement.classList.contains('dark');
        const highlightStyles = this.getHighlightStyles(isDark);

        beforePre.innerHTML = this.renderOriginal(diff, highlightStyles.remove);
        afterPre.innerHTML = this.renderNew(diff, highlightStyles.add);
        beforePre.dataset.diffHighlighted = 'true';
        afterPre.dataset.diffHighlighted = 'true';
    },

    removeRoot(section) {
        const root = section.querySelector(`[${ROOT_ATTR}]`);
        if (root) {
            root.remove();
        }
    },

    removeOrphanRoots(pastesByQuestion) {
        for (const section of document.querySelectorAll('section[id^="grading-q-"]')) {
            const questionNum = this.getQuestionNumber(section);
            if (questionNum == null) {
                continue;
            }
            if (!pastesByQuestion.has(questionNum)) {
                this.removeRoot(section);
            }
        }
    },

    // ========== DIFF ALGORITHM (aligned with prompt-diff-highlight.js) ==========

    computeLCS(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array(m + 1)
            .fill(null)
            .map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    },

    backtrack(dp, a, b) {
        const diff = [];
        let i = a.length;
        let j = b.length;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                diff.unshift({ type: 'equal', value: a[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                diff.unshift({ type: 'add', value: b[j - 1] });
                j--;
            } else {
                diff.unshift({ type: 'remove', value: a[i - 1] });
                i--;
            }
        }
        return diff;
    },

    tokenize(text) {
        const tokens = [];
        let current = '';

        for (const char of text) {
            if (char === '\n') {
                if (current) {
                    tokens.push(current);
                }
                tokens.push('\n');
                current = '';
            } else if (char === ' ' || char === '\t') {
                current += char;
            } else {
                if (current && (current.endsWith(' ') || current.endsWith('\t'))) {
                    tokens.push(current);
                    current = '';
                }
                current += char;
            }
        }
        if (current) {
            tokens.push(current);
        }
        return tokens;
    },

    computeDiff(oldText, newText) {
        const oldTokens = this.tokenize(oldText);
        const newTokens = this.tokenize(newText);
        const dp = this.computeLCS(oldTokens, newTokens);
        return this.backtrack(dp, oldTokens, newTokens);
    },

    computeCharDiff(oldText, newText) {
        const a = oldText.split('');
        const b = newText.split('');
        const dp = this.computeLCS(a, b);
        return this.backtrack(dp, a, b);
    },

    groupConsecutive(diff, includeTypes, highlightType) {
        const filtered = diff.filter((d) => includeTypes.includes(d.type));
        const groups = [];

        for (let i = 0; i < filtered.length; i++) {
            const item = filtered[i];
            const nextItem = filtered[i + 1];
            const lastGroup = groups[groups.length - 1];

            if (
                lastGroup &&
                lastGroup.type === item.type &&
                item.value !== '\n' &&
                !lastGroup.values.includes('\n')
            ) {
                lastGroup.values.push(item.value);
                if (nextItem && nextItem.type !== item.type && item.type === highlightType) {
                    lastGroup.trimTrailing = true;
                }
            } else {
                const group = { type: item.type, values: [item.value], trimTrailing: false };
                if (nextItem && nextItem.type !== item.type && item.type === highlightType) {
                    group.trimTrailing = true;
                }
                groups.push(group);
            }
        }

        return groups;
    },

    trimTrailingSpace(str) {
        return str.replace(/[ \t]+$/, '');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    getHighlightStyles(isDark) {
        const removeBg = isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.3)';
        const addBg = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.3)';
        return {
            remove: `background-color:${removeBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`,
            add: `background-color:${addBg};border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`
        };
    },

    renderOriginal(diff, removeStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'remove'], 'remove');
        let html = '';

        groups.forEach((group) => {
            const text = group.values.join('');
            if (group.type === 'remove') {
                if (text === '\n') {
                    html += `<span class="diff-newline-marker" style="${removeStyle}">↵</span>\n`;
                } else if (group.trimTrailing) {
                    const trimmed = this.trimTrailingSpace(text);
                    const trailing = text.slice(trimmed.length);
                    html += `<span style="${removeStyle}">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                } else {
                    html += `<span style="${removeStyle}">${this.escapeHtml(text)}</span>`;
                }
            } else {
                html += `<span class="text-muted-foreground">${this.escapeHtml(text)}</span>`;
            }
        });

        return html;
    },

    renderNew(diff, addStyle) {
        const groups = this.groupConsecutive(diff, ['equal', 'add'], 'add');
        let html = '';

        groups.forEach((group) => {
            const text = group.values.join('');
            if (group.type === 'add') {
                if (text === '\n') {
                    html += `<span class="diff-newline-marker" style="${addStyle}">↵</span>\n`;
                } else if (group.trimTrailing) {
                    const trimmed = this.trimTrailingSpace(text);
                    const trailing = text.slice(trimmed.length);
                    html += `<span style="${addStyle}">${this.escapeHtml(trimmed)}</span>${this.escapeHtml(trailing)}`;
                } else {
                    html += `<span style="${addStyle}">${this.escapeHtml(text)}</span>`;
                }
            } else {
                html += `<span class="text-muted-foreground">${this.escapeHtml(text)}</span>`;
            }
        });

        return html;
    }
};
