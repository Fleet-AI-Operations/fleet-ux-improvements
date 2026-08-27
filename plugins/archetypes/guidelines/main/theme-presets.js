// ============= theme-presets.js =============
// Archetype: guidelines (work/guidelines).
// Preset text themes on the TipTap edit toolbar (after Redo, before export).

const EDITOR_SEL = '[data-guidelines-editor="true"]';
const WRAP_MARKER = 'data-fleet-guidelines-themes';
const DATALIST_ID = 'fleet-guidelines-theme-list';
const EXPORT_MARKER = 'data-fleet-guidelines-export';

const PRESETS = [
    { name: 'Title', heading: 1, color: '#db2777', underline: true },
    { name: 'Section', heading: 2, color: '#6b7280' },
    { name: 'Subsection', heading: 3, color: '#387dc9', bold: true },
    { name: 'FAQ', toggle: true, color: '#9f765a' },
    { name: 'Step', color: '#387dc9', bold: true },
    { name: 'Allowed', color: '#50946e' },
    { name: 'Forbidden', color: '#cf5148' },
    { name: 'Term', color: '#cb9434', bold: true },
    { name: 'Qualifier', color: '#cb9434', italic: true },
    { name: 'Caution', color: '#d97706' },
    { name: 'Link', color: '#0d9488' },
    { name: 'Ban', highlight: '#fbcfe8' },
    { name: 'Must', highlight: '#fef08a' },
    { name: 'Ok', highlight: '#bbf7d0' }
];

const THEME_MARKS = ['textStyle', 'color', 'underline', 'bold', 'italic', 'highlight'];

const plugin = {
    id: 'guidelinesThemePresets',
    name: 'Guideline Theme Presets',
    description: 'Apply named text themes from the edit toolbar',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false,
        savedSel: null,
        onSel: null,
        boundEditor: null,
        tiptap: null
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

    findPreset(name) {
        const key = String(name || '').trim().toLowerCase();
        if (!key) {
            return null;
        }
        for (const preset of PRESETS) {
            if (preset.name.toLowerCase() === key) {
                return preset;
            }
        }
        return null;
    },

    rgbToHex(r, g, b) {
        const to = (n) => {
            const v = Math.max(0, Math.min(255, Number(n) || 0));
            return v.toString(16).padStart(2, '0');
        };
        return '#' + to(r) + to(g) + to(b);
    },

    normalizeColor(value) {
        if (!value) {
            return '';
        }
        const s = String(value).trim().toLowerCase();
        const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgb) {
            return this.rgbToHex(rgb[1], rgb[2], rgb[3]);
        }
        if (s.charAt(0) === '#') {
            if (s.length === 4) {
                return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
            }
            if (s.length >= 7) {
                return s.slice(0, 7);
            }
        }
        return '';
    },

    colorsEqual(a, b) {
        const left = this.normalizeColor(a);
        const right = this.normalizeColor(b);
        return !!(left && right && left === right);
    },

    markByName(marks, name) {
        if (!marks || !marks.length) {
            return null;
        }
        for (const mark of marks) {
            if (mark && mark.type && mark.type.name === name) {
                return mark;
            }
        }
        return null;
    },

    snapshotFromView(view) {
        if (!this.isPmView(view)) {
            return null;
        }
        const sel = view.state.selection;
        const $from = sel.$from;
        const marks = sel.empty
            ? (view.state.storedMarks || $from.marks())
            : $from.marks();
        const textStyle = this.markByName(marks, 'textStyle') || this.markByName(marks, 'color');
        const highlight = this.markByName(marks, 'highlight');
        return {
            heading: this.headingLevel(view),
            toggle: this.inDetails(view),
            color: textStyle && textStyle.attrs ? textStyle.attrs.color || '' : '',
            highlight: highlight && highlight.attrs
                ? highlight.attrs.color || highlight.attrs.backgroundColor || ''
                : '',
            underline: !!this.markByName(marks, 'underline'),
            bold: !!this.markByName(marks, 'bold'),
            italic: !!this.markByName(marks, 'italic')
        };
    },

    snapshotFromDom(editorEl) {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode) {
            return null;
        }
        let el = sel.anchorNode;
        if (el.nodeType !== Node.ELEMENT_NODE) {
            el = el.parentElement;
        }
        if (!el || !editorEl.contains(el)) {
            return null;
        }
        const headingEl = el.closest('h1, h2, h3, h4, h5, h6');
        const heading = headingEl ? parseInt(headingEl.tagName.charAt(1), 10) || 0 : 0;
        const mark = el.closest('mark');
        let color = '';
        let node = el;
        while (node && editorEl.contains(node)) {
            if (node.style && node.style.color) {
                color = node.style.color;
                break;
            }
            node = node.parentElement;
        }
        return {
            heading,
            toggle: !!el.closest('details'),
            color,
            highlight: mark
                ? mark.getAttribute('data-color') || (mark.style && mark.style.backgroundColor) || ''
                : '',
            underline: !!(el.closest('u') || /underline/.test(
                (el.style && el.style.textDecoration) || ''
            )),
            bold: !!el.closest('strong, b'),
            italic: !!el.closest('em, i')
        };
    },

    snapshotAtCaret(editorEl) {
        const api = this.findEditorApi(editorEl);
        return this.snapshotFromView(api.view) || this.snapshotFromDom(editorEl);
    },

    scorePreset(preset, snap) {
        if (!preset || !snap) {
            return -1;
        }
        if (preset.heading && snap.heading !== preset.heading) {
            return -1;
        }
        if (preset.toggle && !snap.toggle) {
            return -1;
        }
        if (preset.color && !this.colorsEqual(snap.color, preset.color)) {
            return -1;
        }
        if (preset.highlight && !this.colorsEqual(snap.highlight, preset.highlight)) {
            return -1;
        }
        if (preset.underline && !snap.underline) {
            return -1;
        }
        if (preset.bold && !snap.bold) {
            return -1;
        }
        if (preset.italic && !snap.italic) {
            return -1;
        }
        let score = 0;
        if (preset.heading) {
            score += 10;
        }
        if (preset.toggle) {
            score += 10;
        }
        if (preset.highlight) {
            score += 8;
        }
        if (preset.color) {
            score += 4;
        }
        if (preset.underline) {
            score += 2;
        }
        if (preset.bold) {
            score += 2;
        }
        if (preset.italic) {
            score += 2;
        }
        return score;
    },

    matchTheme(editorEl) {
        const snap = this.snapshotAtCaret(editorEl);
        if (!snap) {
            return '';
        }
        let best = null;
        let bestScore = 0;
        for (const preset of PRESETS) {
            const score = this.scorePreset(preset, snap);
            if (score > bestScore) {
                bestScore = score;
                best = preset;
            }
        }
        return best ? best.name : '';
    },

    syncThemeDisplay(editorEl, input) {
        if (!editorEl || !input || input === document.activeElement) {
            return;
        }
        const sel = window.getSelection();
        if (sel && sel.anchorNode && !editorEl.contains(sel.anchorNode)) {
            return;
        }
        const name = this.matchTheme(editorEl);
        if (input.value !== name) {
            input.value = name;
        }
    },

    unbindCaret(state) {
        if (state && state.onSel) {
            document.removeEventListener('selectionchange', state.onSel);
            if (state.boundEditor) {
                state.boundEditor.removeEventListener('keyup', state.onSel);
                state.boundEditor.removeEventListener('mouseup', state.onSel);
            }
            if (state.tiptap && typeof state.tiptap.off === 'function') {
                state.tiptap.off('selectionUpdate', state.onSel);
            }
        }
        if (state) {
            state.onSel = null;
            state.boundEditor = null;
            state.tiptap = null;
        }
    },

    bindCaret(state, editorEl, input) {
        if (!editorEl || !input) {
            return;
        }
        if (state.boundEditor === editorEl && state.onSel) {
            return;
        }
        this.unbindCaret(state);
        const onSel = () => this.syncThemeDisplay(editorEl, input);
        document.addEventListener('selectionchange', onSel);
        editorEl.addEventListener('keyup', onSel);
        editorEl.addEventListener('mouseup', onSel);
        const api = this.findEditorApi(editorEl);
        if (api.editor && typeof api.editor.on === 'function') {
            api.editor.on('selectionUpdate', onSel);
            state.tiptap = api.editor;
        }
        state.onSel = onSel;
        state.boundEditor = editorEl;
        onSel();
    },

    isTiptapEditor(obj) {
        return !!(
            obj &&
            typeof obj === 'object' &&
            typeof obj.chain === 'function' &&
            obj.view &&
            obj.view.state &&
            obj.view.state.schema
        );
    },

    isPmView(obj) {
        return !!(obj && obj.state && obj.state.schema && typeof obj.dispatch === 'function');
    },

    viewFromUnknown(obj) {
        if (!obj || typeof obj !== 'object') {
            return null;
        }
        if (this.isTiptapEditor(obj)) {
            return { editor: obj, view: obj.view };
        }
        if (this.isTiptapEditor(obj.editor)) {
            return { editor: obj.editor, view: obj.editor.view };
        }
        if (this.isPmView(obj)) {
            const editor = this.isTiptapEditor(obj.editor) ? obj.editor : null;
            return { editor, view: obj };
        }
        if (this.isPmView(obj.view)) {
            const editor = this.isTiptapEditor(obj.view.editor) ? obj.view.editor : null;
            return { editor, view: obj.view };
        }
        return null;
    },

    fromDesc(el) {
        if (!el || !el.pmViewDesc) {
            return null;
        }
        let desc = el.pmViewDesc;
        while (desc.parent) {
            desc = desc.parent;
        }
        const view = desc.view || desc.editorView || null;
        if (!this.isPmView(view)) {
            return null;
        }
        const editor = this.isTiptapEditor(view.editor) ? view.editor : null;
        return { editor, view };
    },

    fiberSearch(el) {
        if (!el) {
            return null;
        }
        let fiberKey = null;
        for (const key of Object.keys(el)) {
            if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
                fiberKey = key;
                break;
            }
        }
        if (!fiberKey) {
            return null;
        }
        let fiber = el[fiberKey];
        for (let i = 0; i < 60 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            const fromProps =
                this.viewFromUnknown(props && props.editor) || this.viewFromUnknown(props);
            if (fromProps) {
                return fromProps;
            }
            let hook = fiber.memoizedState;
            for (let j = 0; j < 40 && hook; j++) {
                const fromHook = this.viewFromUnknown(hook.memoizedState);
                if (fromHook) {
                    return fromHook;
                }
                hook = hook.next;
            }
            fiber = fiber.return;
        }
        return null;
    },

    findEditorApi(dom) {
        if (!dom) {
            return { editor: null, view: null };
        }
        let found = this.fromDesc(dom);
        if (found) {
            if (!found.editor) {
                const viaFiber = this.fiberSearch(dom);
                if (viaFiber && viaFiber.editor) {
                    found.editor = viaFiber.editor;
                }
            }
            return found;
        }
        let node = dom;
        for (let i = 0; i < 12 && node; i++) {
            found = this.fromDesc(node) || this.fiberSearch(node);
            if (found) {
                return found;
            }
            node = node.parentElement;
        }
        return { editor: null, view: null };
    },

    captureSelection(state, editorEl) {
        const api = this.findEditorApi(editorEl);
        if (api.view && api.view.state && api.view.state.selection) {
            const sel = api.view.state.selection;
            state.savedSel = { from: sel.from, to: sel.to, empty: sel.empty, kind: 'pm' };
            return;
        }
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            state.savedSel = null;
            return;
        }
        try {
            state.savedSel = { kind: 'dom', range: sel.getRangeAt(0).cloneRange() };
        } catch (err) {
            state.savedSel = null;
        }
    },

    restorePmSelection(view, saved) {
        if (!view || !saved || saved.kind !== 'pm') {
            return;
        }
        const max = view.state.doc.content.size;
        const from = Math.max(0, Math.min(saved.from, max));
        const to = Math.max(0, Math.min(saved.to, max));
        try {
            const Ctor = view.state.selection.constructor;
            if (typeof Ctor.create !== 'function') {
                view.focus();
                return;
            }
            const next = Ctor.create(view.state.doc, from, to);
            view.dispatch(view.state.tr.setSelection(next));
        } catch (err) {
            Logger.debug('could not restore selection');
        }
        view.focus();
    },

    expandToBlock(view) {
        const sel = view.state.selection;
        if (!sel.empty) {
            return { from: sel.from, to: sel.to };
        }
        const $from = sel.$from;
        const start = $from.start();
        const end = $from.end();
        if (start < end) {
            return { from: start, to: end };
        }
        return { from: sel.from, to: sel.to, stored: true };
    },

    pmBlockRange(view) {
        const sel = view.state.selection;
        if (typeof sel.$from.blockRange === 'function') {
            const br = sel.$from.blockRange(sel.$to);
            if (br) {
                return br;
            }
        }
        return null;
    },

    headingLevel(view) {
        const $from = view.state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type && node.type.name === 'heading') {
                return node.attrs.level || 1;
            }
        }
        return 0;
    },

    inDetails(view) {
        const $from = view.state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
            const name = $from.node(d).type && $from.node(d).type.name;
            if (name === 'details' || name === 'detailsSummary' || name === 'toggle') {
                return true;
            }
        }
        return false;
    },

    selectSummaryContent(view) {
        const $from = view.state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
            const name = $from.node(d).type && $from.node(d).type.name;
            if (name === 'detailsSummary') {
                const from = $from.start(d);
                const to = $from.end(d);
                try {
                    const Ctor = view.state.selection.constructor;
                    view.dispatch(
                        view.state.tr.setSelection(Ctor.create(view.state.doc, from, to))
                    );
                } catch (err) {
                    return false;
                }
                return true;
            }
        }
        return false;
    },

    clickToolbar(toolbar, title) {
        if (!toolbar) {
            return false;
        }
        const buttons = toolbar.querySelectorAll('button[title]');
        for (const btn of buttons) {
            if (btn.getAttribute('title') === title) {
                btn.click();
                return true;
            }
        }
        return false;
    },

    hasCmd(editor, name) {
        return !!(editor && editor.commands && typeof editor.commands[name] === 'function');
    },

    queueCmd(chain, editor, name, arg) {
        if (!this.hasCmd(editor, name) || typeof chain[name] !== 'function') {
            return chain;
        }
        if (arg === undefined) {
            return chain[name]();
        }
        return chain[name](arg);
    },

    tiptapCanApply(editor, preset) {
        if (!this.isTiptapEditor(editor)) {
            return false;
        }
        if (preset.heading && !this.hasCmd(editor, 'setHeading')) {
            return false;
        }
        if (preset.toggle && !this.hasCmd(editor, 'setDetails') && !this.inDetails(editor.view)) {
            return false;
        }
        if (preset.color && !this.hasCmd(editor, 'setColor')) {
            return false;
        }
        if (preset.underline && !this.hasCmd(editor, 'setUnderline')) {
            return false;
        }
        if (preset.bold && !this.hasCmd(editor, 'setBold')) {
            return false;
        }
        if (preset.italic && !this.hasCmd(editor, 'setItalic')) {
            return false;
        }
        if (preset.highlight && !this.hasCmd(editor, 'setHighlight')) {
            return false;
        }
        return true;
    },

    applyViaTiptap(editor, preset, saved) {
        if (!this.tiptapCanApply(editor, preset)) {
            return false;
        }
        if (saved && saved.kind === 'pm') {
            this.restorePmSelection(editor.view, saved);
        } else {
            editor.view.focus();
        }
        const range = this.expandToBlock(editor.view);
        let chain = editor.chain().focus();
        if (!range.stored) {
            chain = this.queueCmd(chain, editor, 'setTextSelection', {
                from: range.from,
                to: range.to
            });
        }
        if (preset.heading) {
            chain = this.queueCmd(chain, editor, 'setHeading', { level: preset.heading });
        }
        if (preset.toggle && !this.inDetails(editor.view)) {
            chain = this.queueCmd(chain, editor, 'setDetails');
        }
        chain = this.queueCmd(chain, editor, 'unsetHighlight');
        chain = this.queueCmd(chain, editor, 'unsetColor');
        chain = this.queueCmd(chain, editor, 'unsetUnderline');
        chain = this.queueCmd(chain, editor, 'unsetBold');
        chain = this.queueCmd(chain, editor, 'unsetItalic');
        if (preset.color) {
            chain = this.queueCmd(chain, editor, 'setColor', preset.color);
        }
        if (preset.underline) {
            chain = this.queueCmd(chain, editor, 'setUnderline');
        }
        if (preset.bold) {
            chain = this.queueCmd(chain, editor, 'setBold');
        }
        if (preset.italic) {
            chain = this.queueCmd(chain, editor, 'setItalic');
        }
        if (preset.highlight) {
            chain = this.queueCmd(chain, editor, 'setHighlight', { color: preset.highlight });
        }
        const ok = chain.run();
        if (!ok) {
            return false;
        }
        if (preset.toggle) {
            this.selectSummaryContent(editor.view);
            if (preset.color && this.hasCmd(editor, 'setColor')) {
                editor.chain().focus().setColor(preset.color).run();
            }
        }
        return true;
    },

    schemaMark(schema, name) {
        return schema && schema.marks && schema.marks[name] ? schema.marks[name] : null;
    },

    colorMarkType(schema) {
        return this.schemaMark(schema, 'textStyle') || this.schemaMark(schema, 'color');
    },

    pmCanApply(view, preset) {
        if (!this.isPmView(view)) {
            return false;
        }
        const schema = view.state.schema;
        if (preset.heading && !(schema.nodes && schema.nodes.heading)) {
            return false;
        }
        if (preset.color && !this.colorMarkType(schema)) {
            return false;
        }
        if (preset.underline && !this.schemaMark(schema, 'underline')) {
            return false;
        }
        if (preset.bold && !this.schemaMark(schema, 'bold')) {
            return false;
        }
        if (preset.italic && !this.schemaMark(schema, 'italic')) {
            return false;
        }
        if (preset.highlight && !this.schemaMark(schema, 'highlight')) {
            return false;
        }
        return true;
    },

    applyMarksPm(tr, from, to, schema, preset, stored) {
        if (!stored) {
            for (const name of THEME_MARKS) {
                const mt = this.schemaMark(schema, name);
                if (mt) {
                    tr = tr.removeMark(from, to, mt);
                }
            }
        }
        const marks = [];
        const textStyle = this.colorMarkType(schema);
        const underline = this.schemaMark(schema, 'underline');
        const bold = this.schemaMark(schema, 'bold');
        const italic = this.schemaMark(schema, 'italic');
        const highlight = this.schemaMark(schema, 'highlight');
        if (preset.color && textStyle) {
            marks.push(textStyle.create({ color: preset.color }));
        }
        if (preset.underline && underline) {
            marks.push(underline.create());
        }
        if (preset.bold && bold) {
            marks.push(bold.create());
        }
        if (preset.italic && italic) {
            marks.push(italic.create());
        }
        if (preset.highlight && highlight) {
            marks.push(highlight.create({ color: preset.highlight }));
        }
        if (stored) {
            return tr.setStoredMarks(marks);
        }
        for (const mark of marks) {
            tr = tr.addMark(from, to, mark);
        }
        return tr;
    },

    applyViaPm(view, preset) {
        if (!this.pmCanApply(view, preset)) {
            return false;
        }
        if (preset.toggle) {
            if (!this.inDetails(view)) {
                return false;
            }
            this.selectSummaryContent(view);
        }
        const schema = view.state.schema;
        let tr = view.state.tr;
        if (preset.heading && schema.nodes && schema.nodes.heading) {
            const current = this.headingLevel(view);
            if (current !== preset.heading) {
                const br = this.pmBlockRange(view);
                if (!br) {
                    return false;
                }
                try {
                    tr = tr.setBlockType(br.start, br.end, schema.nodes.heading, {
                        level: preset.heading
                    });
                } catch (err) {
                    Logger.debug('setBlockType failed');
                    return false;
                }
            }
        }
        const sel = tr.selection;
        const $from = sel.$from;
        const from = sel.empty ? $from.start() : sel.from;
        const to = sel.empty ? $from.end() : sel.to;
        const stored = from >= to;
        tr = this.applyMarksPm(tr, from, to, schema, preset, stored);
        view.dispatch(tr);
        view.focus();
        return true;
    },

    applyMarksOnly(api, preset) {
        if (preset.toggle && api.view) {
            this.selectSummaryContent(api.view);
        }
        const markPreset = Object.assign({}, preset);
        delete markPreset.heading;
        delete markPreset.toggle;
        if (api.editor && this.tiptapCanApply(api.editor, markPreset)) {
            return this.applyViaTiptap(api.editor, markPreset, null);
        }
        if (api.view && this.pmCanApply(api.view, markPreset)) {
            return this.applyViaPm(api.view, markPreset);
        }
        return false;
    },

    applyAfterClick(editorEl, toolbar, preset, input) {
        const api0 = this.findEditorApi(editorEl);
        let clicked = false;
        if (preset.heading) {
            const already = api0.view && this.headingLevel(api0.view) === preset.heading;
            if (!already) {
                if (!this.clickToolbar(toolbar, 'Heading ' + preset.heading)) {
                    this.flash(input, false);
                    Logger.warn('theme apply failed — marks not set');
                    return;
                }
                clicked = true;
            }
        }
        if (preset.toggle) {
            const already = api0.view && this.inDetails(api0.view);
            if (!already) {
                if (!this.clickToolbar(toolbar, 'Toggle Block')) {
                    this.flash(input, false);
                    Logger.warn('theme apply failed — marks not set');
                    return;
                }
                clicked = true;
            }
        }
        const finish = () => {
            const api = this.findEditorApi(editorEl);
            const marked = this.applyMarksOnly(api, preset);
            if (marked) {
                this.flash(input, true);
                Logger.log('applied ' + preset.name);
                input.value = preset.name;
            } else {
                this.flash(input, false);
                Logger.warn('theme apply failed — marks not set');
            }
        };
        if (clicked) {
            window.requestAnimationFrame(finish);
        } else {
            finish();
        }
    },

    flash(el, ok) {
        const fb = Context.buttonFeedback;
        if (!el || !fb) {
            return;
        }
        if (ok && typeof fb.flashSuccess === 'function') {
            fb.flashSuccess(el);
        } else if (!ok && typeof fb.flashFailure === 'function') {
            fb.flashFailure(el);
        }
    },

    applyPreset(state, preset, input) {
        const editorEl = this.findEditor();
        const toolbar = this.findToolbar(editorEl);
        if (!editorEl || !preset) {
            this.flash(input, false);
            Logger.warn('theme apply failed — editor not found');
            return;
        }
        const api = this.findEditorApi(editorEl);
        const view = api.view;
        const tiptap = api.editor;
        if (view && state.savedSel && state.savedSel.kind === 'pm') {
            this.restorePmSelection(view, state.savedSel);
        } else if (state.savedSel && state.savedSel.kind === 'dom' && state.savedSel.range) {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(state.savedSel.range);
            }
            editorEl.focus();
        } else {
            editorEl.focus();
        }

        let ok = false;
        try {
            if (tiptap) {
                ok = this.applyViaTiptap(tiptap, preset, state.savedSel);
            }
            if (!ok && view) {
                ok = this.applyViaPm(view, preset);
            }
            if (!ok && toolbar && (preset.heading || preset.toggle)) {
                this.applyAfterClick(editorEl, toolbar, preset, input);
                return;
            }
        } catch (err) {
            this.flash(input, false);
            Logger.error('theme apply threw', err);
            return;
        }
        if (!ok) {
            this.flash(input, false);
            Logger.warn('theme apply failed — no editor view');
            return;
        }
        this.flash(input, true);
        Logger.log('applied ' + preset.name);
        input.value = preset.name;
    },

    injectPicker(state, toolbar, editor) {
        if (!toolbar || toolbar.querySelector(`[${WRAP_MARKER}="1"]`)) {
            return false;
        }
        const wrap = document.createElement('span');
        wrap.setAttribute(WRAP_MARKER, '1');
        wrap.style.cssText = 'display:inline-flex;align-items:center;margin-left:4px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('list', DATALIST_ID);
        input.placeholder = 'Theme';
        input.title = 'Theme';
        input.setAttribute('aria-label', 'Theme');
        input.autocomplete = 'off';
        input.className =
            'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground';
        input.style.width = '7.5rem';

        const list = document.createElement('datalist');
        list.id = DATALIST_ID;
        for (const preset of PRESETS) {
            const opt = document.createElement('option');
            opt.value = preset.name;
            list.appendChild(opt);
        }

        const saveSel = () => this.captureSelection(state, editor);
        input.addEventListener('pointerdown', saveSel, true);
        input.addEventListener('focus', saveSel);

        const tryApply = () => {
            const preset = this.findPreset(input.value);
            if (!preset) {
                return;
            }
            this.applyPreset(state, preset, input);
        };
        input.addEventListener('change', tryApply);
        input.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter') {
                return;
            }
            evt.preventDefault();
            const preset = this.findPreset(input.value);
            if (!preset) {
                this.flash(input, false);
                Logger.warn('unknown theme');
                return;
            }
            this.applyPreset(state, preset, input);
        });

        wrap.append(input, list);
        this.bindCaret(state, editor, input);
        const exportBtn = toolbar.querySelector(`[${EXPORT_MARKER}="1"]`);
        if (exportBtn) {
            toolbar.insertBefore(wrap, exportBtn);
        } else {
            const redo = toolbar.querySelector('button[title="Redo"]');
            if (redo && redo.nextSibling) {
                toolbar.insertBefore(wrap, redo.nextSibling);
            } else if (redo) {
                redo.after(wrap);
            } else {
                toolbar.appendChild(wrap);
            }
        }
        return true;
    },

    onMutation(state) {
        const editor = this.findEditor();
        const toolbar = this.findToolbar(editor);
        if (!editor || !toolbar) {
            if (state.activationLogged) {
                Logger.debug('theme presets removed (editor closed)');
                state.activationLogged = false;
            }
            this.unbindCaret(state);
            return;
        }
        const injected = this.injectPicker(state, toolbar, editor);
        const wrap = toolbar.querySelector(`[${WRAP_MARKER}="1"]`);
        const input = wrap ? wrap.querySelector('input') : null;
        if (input) {
            this.bindCaret(state, editor, input);
        }
        if ((injected || wrap) && !state.activationLogged) {
            Logger.log('theme presets added');
            state.activationLogged = true;
        }
    },

    destroy(state) {
        this.unbindCaret(state);
        const wrap = document.querySelector(`[${WRAP_MARKER}="1"]`);
        if (wrap) {
            wrap.remove();
        }
        if (state) {
            state.activationLogged = false;
            state.savedSel = null;
        }
    }
};
