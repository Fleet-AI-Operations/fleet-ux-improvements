// ============= grade-question-pasted-text.js =============
// Archetype: assessments-grade-detail (work/assessments/grade/*) — per-question pasted clipboard text.

const STYLE_ID = 'fleet-assessments-grade-paste-diff-style';
const ROOT_ATTR = 'data-fleet-grade-pasted-text';
const PASTE_SUMMARY_RE = /^paste on #(\d+) · (\d+) chars · /;

const plugin = {
    id: 'assessmentsGradeQuestionPastedText',
    name: 'Grade Question Pasted Text',
    description:
        'Shows clipboard paste events per question in grading sections, with diff vs applicant answer on the last paste',
    _version: '1.6',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        stylesInjected: false,
        activationLogged: false,
        clipboardHostMissingLogged: false,
        clipboardHost: null,
        lastRunSig: null,
        syncInProgress: false
    },
    storageKeys: {
        granularity: 'assessments-grade-paste-diff-granularity'
    },
    sectionUi: new WeakMap(),

    init(state) {
        this.ensureDiffStyles(state);
    },

    onMutation(state) {
        if (state.syncInProgress) {
            return;
        }

        this.ensureDiffStyles(state);

        const pastesByQuestion = this.scrapePastesByQuestion(state);
        const gradingSections = this.findGradingSections();
        const runSig = this.buildRunSignature(pastesByQuestion, gradingSections);

        if (runSig === state.lastRunSig) {
            return;
        }

        if (!this.runNeedsDomWork(pastesByQuestion, gradingSections)) {
            state.lastRunSig = runSig;
            return;
        }

        state.syncInProgress = true;
        let injectedCount = 0;
        try {
            if (pastesByQuestion.size === 0) {
                this.removeOrphanRoots(pastesByQuestion);
                state.lastRunSig = runSig;
                return;
            }

            for (const section of gradingSections) {
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
                if (
                    this.syncSection(section, questionNum, pastes, applicantAnswer, state)
                ) {
                    injectedCount += 1;
                }
            }

            this.removeOrphanRoots(pastesByQuestion);

            if (injectedCount > 0 && !state.activationLogged) {
                Logger.info(
                    `${this.id}: pasted-text blocks active for ${injectedCount} question section(s)`
                );
                state.activationLogged = true;
            }
        } finally {
            state.syncInProgress = false;
            state.lastRunSig = runSig;
        }
    },

    isFleetUi(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (el.closest(`[${ROOT_ATTR}]`)) {
            return true;
        }
        const pluginRoot = el.closest('[data-fleet-plugin]');
        return pluginRoot && pluginRoot.getAttribute('data-fleet-plugin') === this.id;
    },

    labelText(el) {
        return (el && el.textContent ? el.textContent : '').trim();
    },

    isPasteSummaryLine(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'DIV') {
            return false;
        }
        if (el.children.length > 0) {
            return false;
        }
        if (this.isFleetUi(el)) {
            return false;
        }
        return PASTE_SUMMARY_RE.test(this.labelText(el));
    },

    findClipboardEventsListHost(state) {
        if (state.clipboardHost && document.contains(state.clipboardHost)) {
            return state.clipboardHost;
        }
        state.clipboardHost = null;

        const sections = document.getElementsByTagName('section');
        for (let i = 0; i < sections.length; i += 1) {
            const section = sections[i];
            if (this.isFleetUi(section)) {
                continue;
            }
            const headings = section.getElementsByTagName('div');
            for (let j = 0; j < headings.length; j += 1) {
                const heading = headings[j];
                if (this.isFleetUi(heading)) {
                    continue;
                }
                if (this.labelText(heading) !== 'Clipboard events') {
                    continue;
                }
                const listHost = heading.nextElementSibling;
                if (listHost && !this.isFleetUi(listHost)) {
                    state.clipboardHost = listHost;
                    return listHost;
                }
            }
        }

        if (!state.clipboardHostMissingLogged) {
            Logger.debug(`${this.id}: clipboard events list not found yet`);
            state.clipboardHostMissingLogged = true;
        }
        return null;
    },

    extractPasteFromCard(card) {
        if (!card || this.isFleetUi(card)) {
            return null;
        }
        let summary = null;
        const divs = card.getElementsByTagName('div');
        for (let i = 0; i < divs.length; i += 1) {
            const div = divs[i];
            if (this.isPasteSummaryLine(div)) {
                summary = div;
                break;
            }
        }
        if (!summary) {
            return null;
        }
        const pres = card.getElementsByTagName('pre');
        let pre = null;
        for (let i = 0; i < pres.length; i += 1) {
            if (!this.isFleetUi(pres[i])) {
                pre = pres[i];
                break;
            }
        }
        if (!pre) {
            return null;
        }
        const parsed = this.parsePasteSummary(summary.textContent);
        if (!parsed) {
            return null;
        }
        return {
            questionNum: parsed.questionNum,
            seconds: parsed.seconds,
            text: (pre.textContent || '').trimEnd()
        };
    },

    findGradingSections() {
        const sections = [];
        const all = document.getElementsByTagName('section');
        for (let i = 0; i < all.length; i += 1) {
            const section = all[i];
            const id = section.id || '';
            if (id.startsWith('grading-q-') && !this.isFleetUi(section)) {
                sections.push(section);
            }
        }
        return sections;
    },

    findRootInSection(section) {
        const nodes = section.getElementsByTagName('div');
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.getAttribute(ROOT_ATTR) === 'true') {
                return node;
            }
        }
        return null;
    },

    serializePastesMap(pastesByQuestion) {
        const parts = [];
        const keys = [...pastesByQuestion.keys()].sort((a, b) => a - b);
        for (const q of keys) {
            const list = pastesByQuestion.get(q) || [];
            const items = list
                .map((p) => `${p.seconds}:${p.text.length}:${p.text.slice(0, 24)}`)
                .join(',');
            parts.push(`${q}=[${items}]`);
        }
        return parts.join(';');
    },

    buildRunSignature(pastesByQuestion, gradingSections) {
        const pastePart = this.serializePastesMap(pastesByQuestion);
        const sectionParts = [];
        for (const section of gradingSections) {
            const q = this.getQuestionNumber(section);
            if (q == null) {
                continue;
            }
            const answer = this.getApplicantAnswerText(section);
            const root = this.findRootInSection(section);
            const rootSig = root ? root.dataset.fleetPasteSig || '' : '';
            sectionParts.push(`${q}:${answer.length}:${answer.slice(0, 48)}:${rootSig}`);
        }
        sectionParts.sort();
        return `${pastePart}||${sectionParts.join('|')}`;
    },

    runNeedsDomWork(pastesByQuestion, gradingSections) {
        for (const section of gradingSections) {
            const questionNum = this.getQuestionNumber(section);
            if (questionNum == null) {
                continue;
            }
            const pastes = pastesByQuestion.get(questionNum);
            const root = this.findRootInSection(section);
            if (pastes && pastes.length > 0) {
                const applicantAnswer = this.getApplicantAnswerText(section);
                const sig = this.buildSignature(questionNum, pastes, applicantAnswer);
                if (!root || root.dataset.fleetPasteSig !== sig) {
                    return true;
                }
            } else if (root) {
                return true;
            }
        }
        return false;
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
            [${ROOT_ATTR}] pre .fleet-paste-diff-equal-muted {
                color: var(--muted-foreground, #737373);
            }
            [${ROOT_ATTR}] pre .fleet-paste-diff-equal-foreground {
                color: var(--foreground, #171717);
            }
            .dark [${ROOT_ATTR}] pre .fleet-paste-diff-equal-foreground {
                color: var(--foreground, #fafafa);
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
            [${ROOT_ATTR}] .fleet-paste-diff-stack {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            [${ROOT_ATTR}] .fleet-paste-diff-block-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
                flex-wrap: wrap;
            }
            [${ROOT_ATTR}] pre.fleet-paste-pre {
                max-height: none;
                overflow: visible;
                white-space: pre-wrap;
                word-break: break-word;
                border-radius: 0.375rem;
                padding: 0.5rem;
                font-family: ui-monospace, monospace;
                font-size: 11px;
                line-height: 1.4;
            }
            [${ROOT_ATTR}] pre.fleet-paste-paste-pre {
                color: var(--muted-foreground, #737373);
                background: var(--muted, rgba(0, 0, 0, 0.04));
                border: 1px solid var(--border, #e5e5e5);
            }
            .dark [${ROOT_ATTR}] pre.fleet-paste-paste-pre {
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.1);
            }
            [${ROOT_ATTR}] pre.fleet-paste-final-answer-pre {
                color: var(--foreground, #171717);
                background: var(--background, #fff);
                border: 1px solid rgb(163, 163, 163);
            }
            .dark [${ROOT_ATTR}] pre.fleet-paste-final-answer-pre {
                color: var(--foreground, #fafafa);
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.38);
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
        if (minutes === 0) {
            return `${seconds}s`;
        }
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
        const atMinSec = trimmed.match(/at (\d+)m, (\d+)s/);
        if (atMinSec) {
            return {
                questionNum,
                seconds: parseInt(atMinSec[1], 10) * 60 + parseInt(atMinSec[2], 10)
            };
        }
        const atSecOnly = trimmed.match(/at (\d+)s\b/);
        if (atSecOnly) {
            return { questionNum, seconds: parseInt(atSecOnly[1], 10) };
        }
        return null;
    },

    scrapePastesByQuestion(state) {
        const byQuestion = new Map();
        const listHost = this.findClipboardEventsListHost(state);
        if (!listHost) {
            return byQuestion;
        }

        state.clipboardHostMissingLogged = false;

        for (const card of listHost.children) {
            if (card.nodeType !== Node.ELEMENT_NODE || this.isFleetUi(card)) {
                continue;
            }
            const extracted = this.extractPasteFromCard(card);
            if (!extracted) {
                continue;
            }
            const list = byQuestion.get(extracted.questionNum) || [];
            const prevOnQuestion = list.length > 0 ? list[list.length - 1].seconds : null;
            list.push({
                seconds: extracted.seconds,
                text: extracted.text,
                timeLabel: this.buildTimeLabel(extracted.seconds, prevOnQuestion)
            });
            byQuestion.set(extracted.questionNum, list);
        }
        return byQuestion;
    },

    buildTimeLabel(seconds, previousSecondsOnQuestion) {
        let label = this.formatDuration(seconds);
        if (previousSecondsOnQuestion != null) {
            const delta = Math.max(0, seconds - previousSecondsOnQuestion);
            label += ` (${this.formatDuration(delta)} since last clipboard event)`;
        }
        return label;
    },

    getQuestionNumber(section) {
        const nodes = section.getElementsByTagName('div');
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (this.isFleetUi(node)) {
                continue;
            }
            const text = this.labelText(node);
            if (text.length > 160) {
                continue;
            }
            const match = text.match(/^Question\s+(\d+)\b/);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return null;
    },

    findApplicantAnswerBlock(section) {
        const labels = section.getElementsByTagName('div');
        for (let i = 0; i < labels.length; i += 1) {
            const label = labels[i];
            if (this.isFleetUi(label)) {
                continue;
            }
            if (this.labelText(label) === "Applicant's answer") {
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
        for (const child of block.children) {
            if (child.nodeType !== Node.ELEMENT_NODE || this.isFleetUi(child)) {
                continue;
            }
            if (this.labelText(child) === "Applicant's answer") {
                continue;
            }
            return (child.textContent || '').trimEnd();
        }
        return '';
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
        let root = this.findRootInSection(section);
        if (root && root.dataset.fleetPasteSig === signature) {
            this.hideNativeApplicantAnswer(anchor);
            return false;
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
        root.appendChild(this.buildHeader());
        root.appendChild(this.buildPasteBlocks(root, pastes, applicantAnswer, ui, noDifference));
        this.hideNativeApplicantAnswer(anchor);
        return true;
    },

    hideNativeApplicantAnswer(block) {
        if (!block) {
            return;
        }
        block.setAttribute('data-fleet-native-applicant-hidden', 'true');
        block.style.display = 'none';
    },

    showNativeApplicantAnswer(section) {
        const block = this.findApplicantAnswerBlock(section);
        if (!block || block.getAttribute('data-fleet-native-applicant-hidden') !== 'true') {
            return;
        }
        block.style.display = '';
        block.removeAttribute('data-fleet-native-applicant-hidden');
    },

    buildHeader() {
        const header = document.createElement('div');
        header.className = 'mb-1';

        const title = document.createElement('div');
        title.className =
            'text-xs font-medium uppercase tracking-wide text-muted-foreground';
        title.textContent = 'Pasted Text';
        header.appendChild(title);

        return header;
    },

    buildDiffControls(root, ui, noDifference) {
        const controls = document.createElement('div');
        controls.className = 'fleet-paste-diff-controls';

        if (noDifference) {
            const badge = document.createElement('span');
            badge.className = 'fleet-paste-no-diff-badge';
            badge.textContent = 'NO DIFFERENCE';
            controls.appendChild(badge);
            return controls;
        }

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'fleet-paste-diff-toggle-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
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
            refreshDiff();
        };

        wordBtn.addEventListener('click', () => setGranularity('word'));
        charBtn.addEventListener('click', () => setGranularity('char'));

        return controls;
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

            if (isLast) {
                block.replaceChildren();
                block.appendChild(
                    this.buildDiffStack(root, paste, applicantAnswer, ui, noDifference)
                );
            } else {
                const label = document.createElement('div');
                label.className = 'mb-1 font-mono text-xs tabular-nums text-muted-foreground';
                label.textContent = paste.timeLabel;
                block.appendChild(label);
                block.appendChild(this.buildPlainPre(paste.text, 'paste'));
            }

            container.appendChild(block);
        });

        return container;
    },

    buildPlainPre(text, role) {
        const pre = document.createElement('pre');
        pre.className =
            role === 'answer'
                ? 'fleet-paste-pre fleet-paste-final-answer-pre'
                : 'fleet-paste-pre fleet-paste-paste-pre';
        pre.textContent = text;
        return pre;
    },

    buildDiffStack(root, paste, applicantAnswer, ui, noDifference) {
        const wrapper = document.createElement('div');

        const blockHeader = document.createElement('div');
        blockHeader.className = 'fleet-paste-diff-block-header';

        const timeLabel = document.createElement('div');
        timeLabel.className = 'font-mono text-xs tabular-nums text-muted-foreground';
        timeLabel.textContent = paste.timeLabel;
        blockHeader.appendChild(timeLabel);
        blockHeader.appendChild(this.buildDiffControls(root, ui, noDifference));
        wrapper.appendChild(blockHeader);

        const stack = document.createElement('div');
        stack.className = 'fleet-paste-diff-stack';
        stack.setAttribute('data-fleet-paste-diff-host', 'true');

        const beforeSection = document.createElement('div');
        const beforeLabel = document.createElement('div');
        beforeLabel.className =
            'mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
        beforeLabel.textContent = 'Last paste';
        const beforePre = this.buildPlainPre(paste.text, 'paste');
        beforePre.setAttribute('data-fleet-paste-diff-before', 'true');
        beforeSection.appendChild(beforeLabel);
        beforeSection.appendChild(beforePre);

        const afterSection = document.createElement('div');
        const afterLabel = document.createElement('div');
        afterLabel.className =
            'mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
        afterLabel.textContent = "Applicant's Final Answer";
        const afterPre = this.buildPlainPre(applicantAnswer, 'answer');
        afterPre.setAttribute('data-fleet-paste-diff-after', 'true');
        afterSection.appendChild(afterLabel);
        afterSection.appendChild(afterPre);

        stack.appendChild(beforeSection);
        stack.appendChild(afterSection);
        wrapper.appendChild(stack);

        beforePre.dataset.originalText = paste.text;
        afterPre.dataset.originalText = applicantAnswer;
        if (noDifference) {
            beforePre.textContent = paste.text;
            afterPre.textContent = applicantAnswer;
        } else {
            this.renderDiffPair(beforePre, afterPre, paste.text, applicantAnswer, ui);
        }

        if (noDifference) {
            stack.setAttribute('data-fleet-paste-no-diff', 'true');
        }

        return wrapper;
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
        const root = this.findRootInSection(section);
        if (root) {
            root.remove();
        }
        this.showNativeApplicantAnswer(section);
    },

    removeOrphanRoots(pastesByQuestion) {
        for (const section of this.findGradingSections()) {
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
                html += `<span class="fleet-paste-diff-equal-muted">${this.escapeHtml(text)}</span>`;
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
                html += `<span class="fleet-paste-diff-equal-foreground">${this.escapeHtml(text)}</span>`;
            }
        });

        return html;
    }
};
