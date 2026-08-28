// ============= export-markdown.js =============
// Archetype: guidelines (work/guidelines).
// Injects an export control on the TipTap edit toolbar and downloads the document as Markdown.

const EDITOR_SEL = '[data-guidelines-editor="true"]';
const BTN_MARKER = 'data-fleet-guidelines-export';
const TITLE_INPUT_ID = 'title';
const FALLBACK_FILENAME = 'guideline.md';

const plugin = {
    id: 'guidelinesExportMarkdown',
    name: 'Export Guideline Markdown',
    description:
        'Download the open guideline as a Markdown file from the edit toolbar',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false
    },

    findEditor() {
        return document.querySelector(EDITOR_SEL);
    },

    findToolbar(editor) {
        if (!editor) {
            return null;
        }
        const shell = editor.closest('div.rounded-md.border') || editor.parentElement;
        if (!shell) {
            return null;
        }
        const candidates = shell.querySelectorAll('div');
        for (const el of candidates) {
            const cl = el.classList;
            if (
                cl.contains('sticky') &&
                cl.contains('top-0') &&
                cl.contains('z-10') &&
                cl.contains('flex') &&
                cl.contains('flex-wrap')
            ) {
                return el;
            }
        }
        return null;
    },

    downloadIcon() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('class', 'h-4 w-4');

        const tray = document.createElementNS(ns, 'path');
        tray.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
        svg.appendChild(tray);

        const poly = document.createElementNS(ns, 'polyline');
        poly.setAttribute('points', '7 10 12 15 17 10');
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', '12');
        line.setAttribute('y1', '15');
        line.setAttribute('x2', '12');
        line.setAttribute('y2', '3');
        svg.append(poly, line);
        return svg;
    },

    injectButton(toolbar) {
        if (!toolbar || toolbar.querySelector(`[${BTN_MARKER}="1"]`)) {
            return false;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Export as Markdown';
        btn.setAttribute('aria-label', 'Export as Markdown');
        btn.setAttribute(BTN_MARKER, '1');
        btn.className = 'rounded p-1.5 transition-colors hover:bg-muted';
        btn.style.marginLeft = 'auto';
        btn.appendChild(this.downloadIcon());
        btn.addEventListener('click', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            this.onExportClick(btn);
        });
        toolbar.appendChild(btn);
        return true;
    },

    filenameFromTitle() {
        const input = document.getElementById(TITLE_INPUT_ID);
        let name = input && typeof input.value === 'string' ? input.value.trim() : '';
        if (!name) {
            return FALLBACK_FILENAME;
        }
        name = name.replace(/[^\w.\- ]+/g, '_').replace(/^[\s_]+|[\s_]+$/g, '').trim();
        if (!name) {
            return FALLBACK_FILENAME;
        }
        if (!/\.md$/i.test(name)) {
            name += '.md';
        }
        return name;
    },

    downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    flash(btn, ok) {
        const fb = Context.buttonFeedback;
        if (!btn || !fb) {
            return;
        }
        if (ok && typeof fb.flashSuccess === 'function') {
            fb.flashSuccess(btn);
        } else if (!ok && typeof fb.flashFailure === 'function') {
            fb.flashFailure(btn);
        }
    },

    onExportClick(btn) {
        const editor = this.findEditor();
        if (!editor) {
            this.flash(btn, false);
            Logger.warn('export failed — editor not found');
            return;
        }
        let markdown;
        try {
            markdown = this.editorToMarkdown(editor);
        } catch (err) {
            this.flash(btn, false);
            Logger.error('export failed — conversion threw', err);
            return;
        }
        if (!markdown || !String(markdown).trim()) {
            this.flash(btn, false);
            Logger.warn('export failed — empty document');
            return;
        }
        const filename = this.filenameFromTitle();
        try {
            this.downloadTextFile(filename, markdown);
        } catch (err) {
            this.flash(btn, false);
            Logger.error('export failed — download threw', err);
            return;
        }
        this.flash(btn, true);
        Logger.log(`exported ${filename} (${markdown.length} chars)`);
    },

    forElementChildren(el, fn) {
        if (!el) {
            return;
        }
        for (const child of el.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                fn(child);
            }
        }
    },

    isEmptyParagraph(el) {
        if (!el || el.tagName !== 'P') {
            return false;
        }
        const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
        return !text;
    },

    isTaskList(el) {
        return !!(el && el.getAttribute('data-type') === 'taskList');
    },

    isCallout(el) {
        return !!(el && el.nodeType === Node.ELEMENT_NODE && el.hasAttribute('data-callout'));
    },

    isDetails(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (el.tagName === 'DETAILS') {
            return true;
        }
        const type = el.getAttribute('data-type');
        return type === 'details' || type === 'toggle';
    },

    wrapDelim(delim, inner) {
        if (!inner) {
            return '';
        }
        return delim + inner + delim;
    },

    wrapInlineCode(text) {
        const t = String(text || '').replace(/\n/g, ' ');
        let ticks = '`';
        const runs = t.match(/`+/g);
        if (runs) {
            let max = 1;
            for (const run of runs) {
                if (run.length >= max) {
                    max = run.length + 1;
                }
            }
            ticks = '`'.repeat(max);
        }
        const pad = t.startsWith(' ') || t.endsWith(' ') || t.startsWith('`') || t.endsWith('`') ? ' ' : '';
        return ticks + pad + t + pad + ticks;
    },

    convertInline(el) {
        if (!el) {
            return '';
        }
        let out = '';
        for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                out += (child.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            const tag = child.tagName.toLowerCase();
            if (tag === 'br') {
                if (child.classList.contains('ProseMirror-trailingBreak')) {
                    continue;
                }
                out += '  \n';
                continue;
            }
            if (tag === 'strong' || tag === 'b') {
                out += this.wrapDelim('**', this.convertInline(child));
                continue;
            }
            if (tag === 'em' || tag === 'i') {
                out += this.wrapDelim('*', this.convertInline(child));
                continue;
            }
            if (tag === 's' || tag === 'del' || tag === 'strike') {
                out += this.wrapDelim('~~', this.convertInline(child));
                continue;
            }
            if (tag === 'code' && !child.closest('pre')) {
                out += this.wrapInlineCode(child.textContent || '');
                continue;
            }
            if (tag === 'a') {
                const href = (child.getAttribute('href') || '').trim();
                const label = this.convertInline(child);
                if (!href) {
                    out += label;
                } else {
                    out += '[' + label + '](' + href + ')';
                }
                continue;
            }
            if (tag === 'img') {
                const src = (child.getAttribute('src') || '').trim();
                const alt = (child.getAttribute('alt') || '').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
                if (src) {
                    out += '![' + alt + '](' + src + ')';
                }
                continue;
            }
            // u, mark, span, and unknown inline wrappers: flatten (drop color/highlight/underline)
            out += this.convertInline(child);
        }
        return out;
    },

    convertBlocks(parent) {
        const parts = [];
        this.forElementChildren(parent, (child) => {
            parts.push(this.convertBlock(child));
        });
        let out = '';
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                out += '\n\n';
            }
            out += parts[i];
        }
        return out;
    },

    convertBlockquote(el) {
        const inner = this.convertBlocks(el).replace(/\n+$/, '');
        if (!inner) {
            return '>';
        }
        return inner
            .split('\n')
            .map((line) => (line === '' ? '>' : '> ' + line))
            .join('\n');
    },

    convertPre(el) {
        const code = el.querySelector('code') || el;
        let lang = '';
        const cls = code.getAttribute('class') || '';
        const langMatch = cls.match(/language-([A-Za-z0-9_+-]+)/);
        if (langMatch) {
            lang = langMatch[1];
        }
        let text = code.textContent || '';
        if (text.endsWith('\n')) {
            text = text.slice(0, -1);
        }
        return '```' + lang + '\n' + text + '\n```';
    },

    convertTable(el) {
        const rows = Array.from(el.querySelectorAll('tr'));
        if (rows.length === 0) {
            return '';
        }
        const cellText = (cell) =>
            this.convertInline(cell).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
        const matrix = rows.map((tr) =>
            Array.from(tr.children)
                .filter((c) => c.tagName === 'TH' || c.tagName === 'TD')
                .map(cellText)
        );
        const cols = matrix.reduce((max, row) => Math.max(max, row.length), 0);
        if (cols === 0) {
            return '';
        }
        const pad = (row) => {
            const next = row.slice();
            while (next.length < cols) {
                next.push('');
            }
            return next;
        };
        const lines = [];
        const header = pad(matrix[0]);
        lines.push('| ' + header.join(' | ') + ' |');
        lines.push('| ' + header.map(() => '---').join(' | ') + ' |');
        for (let i = 1; i < matrix.length; i++) {
            lines.push('| ' + pad(matrix[i]).join(' | ') + ' |');
        }
        return lines.join('\n');
    },

    convertDetails(el) {
        const summary =
            el.querySelector(':scope > summary, :scope > [data-type="detailsSummary"]') ||
            el.querySelector('summary, [data-type="detailsSummary"]');
        const content =
            el.querySelector(':scope > [data-type="detailsContent"]') ||
            el.querySelector('[data-type="detailsContent"]');
        const title = summary ? this.convertInline(summary).trim() : '';
        const bodyParent = content || el;
        const bodyParts = [];
        this.forElementChildren(bodyParent, (child) => {
            if (child === summary || (summary && summary.contains(child))) {
                return;
            }
            if (child.tagName === 'SUMMARY' || child.getAttribute('data-type') === 'detailsSummary') {
                return;
            }
            bodyParts.push(this.convertBlock(child));
        });
        let body = '';
        for (let i = 0; i < bodyParts.length; i++) {
            if (i > 0) {
                body += '\n\n';
            }
            body += bodyParts[i];
        }
        if (title && body) {
            return '**' + title + '**\n\n' + body;
        }
        if (title) {
            return '**' + title + '**';
        }
        return body;
    },

    convertList(el, ordered, indent) {
        const pad = ' '.repeat(indent || 0);
        const items = [];
        let n = 1;
        const task = this.isTaskList(el);
        this.forElementChildren(el, (li) => {
            if (li.tagName !== 'LI') {
                return;
            }
            let marker;
            if (task || li.getAttribute('data-type') === 'taskItem') {
                const checkedAttr = li.getAttribute('data-checked');
                const checked =
                    checkedAttr === 'true' ||
                    !!(li.querySelector && li.querySelector('input[type="checkbox"]:checked'));
                marker = checked ? '- [x]' : '- [ ]';
            } else if (ordered) {
                marker = String(n) + '.';
                n += 1;
            } else {
                marker = '-';
            }
            const hang = pad + ' '.repeat(marker.length + 1);
            const blocks = [];
            const pushChild = (child) => {
                const tag = child.tagName.toLowerCase();
                if (tag === 'label' || tag === 'input') {
                    return;
                }
                if (tag === 'ul' || tag === 'ol') {
                    blocks.push({ kind: 'list', el: child });
                    return;
                }
                const type = child.getAttribute('data-type') || '';
                const flattenWrapper =
                    tag === 'div' &&
                    !this.isCallout(child) &&
                    !this.isDetails(child) &&
                    type !== 'codeBlock';
                if (flattenWrapper) {
                    this.forElementChildren(child, pushChild);
                    return;
                }
                blocks.push({ kind: 'block', el: child });
            };
            this.forElementChildren(li, pushChild);

            const lines = [];
            let usedMarker = false;
            const appendIndented = (md, firstLineUsesMarker) => {
                const split = String(md).split('\n');
                if (firstLineUsesMarker) {
                    lines.push(pad + marker + (split[0] ? ' ' + split[0] : ''));
                    for (let i = 1; i < split.length; i++) {
                        lines.push(split[i] === '' ? hang.replace(/\s+$/, '') : hang + split[i]);
                    }
                    usedMarker = true;
                    return;
                }
                for (const line of split) {
                    lines.push(line === '' ? hang.replace(/\s+$/, '') : hang + line);
                }
            };
            for (const block of blocks) {
                if (block.kind === 'list') {
                    const nestedOrdered = block.el.tagName === 'OL';
                    const nested = this.convertList(block.el, nestedOrdered, (indent || 0) + 4);
                    if (!usedMarker) {
                        lines.push(pad + marker);
                        usedMarker = true;
                    }
                    if (nested) {
                        lines.push(nested);
                    }
                    continue;
                }
                const md = this.convertBlock(block.el);
                if (!usedMarker) {
                    appendIndented(md, true);
                } else {
                    appendIndented(md, false);
                }
            }
            if (!usedMarker) {
                const fallback = this.convertInline(li).trim();
                lines.push(pad + marker + (fallback ? ' ' + fallback : ''));
            }
            items.push(lines.join('\n'));
        });
        return items.join('\n');
    },

    convertBlock(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('data-type') || '';

        if (tag === 'h1') {
            return '# ' + this.convertInline(el).trim();
        }
        if (tag === 'h2') {
            return '## ' + this.convertInline(el).trim();
        }
        if (tag === 'h3') {
            return '### ' + this.convertInline(el).trim();
        }
        if (tag === 'h4') {
            return '#### ' + this.convertInline(el).trim();
        }
        if (tag === 'h5') {
            return '##### ' + this.convertInline(el).trim();
        }
        if (tag === 'h6') {
            return '###### ' + this.convertInline(el).trim();
        }
        if (tag === 'p') {
            if (this.isEmptyParagraph(el)) {
                return '';
            }
            return this.convertInline(el).trim();
        }
        if (tag === 'ul') {
            return this.convertList(el, false, 0);
        }
        if (tag === 'ol') {
            return this.convertList(el, true, 0);
        }
        if (tag === 'blockquote' || this.isCallout(el)) {
            return this.convertBlockquote(el);
        }
        if (tag === 'hr') {
            return '---';
        }
        if (tag === 'table') {
            return this.convertTable(el);
        }
        if (tag === 'pre' || type === 'codeBlock') {
            const pre = tag === 'pre' ? el : el.querySelector('pre') || el;
            return this.convertPre(pre);
        }
        if (this.isDetails(el)) {
            return this.convertDetails(el);
        }
        if (tag === 'img') {
            return this.convertInline(el).trim();
        }
        if (tag === 'br') {
            return '';
        }
        const nested = this.convertBlocks(el);
        if (nested) {
            return nested;
        }
        return this.convertInline(el).trim();
    },

    editorToMarkdown(editor) {
        const body = this.convertBlocks(editor).replace(/\n+$/, '');
        return body ? body + '\n' : '';
    },

    onMutation(state) {
        const editor = this.findEditor();
        const toolbar = this.findToolbar(editor);
        if (!editor || !toolbar) {
            if (state.activationLogged) {
                Logger.debug('export control removed (editor closed)');
                state.activationLogged = false;
            }
            return;
        }
        const injected = this.injectButton(toolbar);
        if (injected && !state.activationLogged) {
            Logger.log('export control added');
            state.activationLogged = true;
        } else if (!state.activationLogged && toolbar.querySelector(`[${BTN_MARKER}="1"]`)) {
            Logger.log('export control added');
            state.activationLogged = true;
        }
    },

    destroy(state) {
        const btn = document.querySelector(`[${BTN_MARKER}="1"]`);
        if (btn) {
            btn.remove();
        }
        if (state) {
            state.activationLogged = false;
        }
    }
};
