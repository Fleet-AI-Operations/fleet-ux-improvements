// ============= theme-presets.js =============
// Archetype: guidelines (work/guidelines).
// Preset text themes on the TipTap edit toolbar (after Redo, before export).

const EDITOR_SEL = '[data-guidelines-editor="true"]';
const WRAP_MARKER = 'data-fleet-guidelines-themes';
const DATALIST_ID = 'fleet-guidelines-theme-list';
const EXPORT_MARKER = 'data-fleet-guidelines-export';

const PRESETS = [
    { name: 'Title', heading: 1, color: 'rgb(219, 39, 119)', underline: true },
    { name: 'Section', heading: 2, color: 'rgb(107, 114, 128)' },
    { name: 'Subsection', heading: 3, color: 'rgb(56, 125, 201)', bold: true },
    { name: 'FAQ', toggle: true, color: 'rgb(159, 118, 90)' },
    { name: 'Step', color: 'rgb(56, 125, 201)', bold: true },
    { name: 'Allowed', color: 'rgb(80, 148, 110)' },
    { name: 'Forbidden', color: 'rgb(207, 81, 72)' },
    { name: 'Term', color: 'rgb(203, 148, 52)', bold: true },
    { name: 'Qualifier', color: 'rgb(203, 148, 52)', italic: true },
    { name: 'Caution', color: 'rgb(217, 119, 6)' },
    { name: 'Link', color: 'rgb(13, 148, 136)' },
    { name: 'Ban', highlight: '#fbcfe8' },
    { name: 'Must', highlight: '#fef08a' },
    { name: 'Ok', highlight: '#bbf7d0' }
];

const THEME_MARKS = ['textStyle', 'underline', 'bold', 'italic', 'highlight'];

const plugin = {
    id: 'guidelinesThemePresets',
    name: 'Guideline Theme Presets',
    description: 'Apply named text themes from the edit toolbar',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        activationLogged: false,
        savedSel: null
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

    findPmView(editor) {
        if (!editor) {
            return null;
        }
        const fromDesc = (el) => {
            if (!el || !el.pmViewDesc) {
                return null;
            }
            let desc = el.pmViewDesc;
            while (desc.parent) {
                desc = desc.parent;
            }
            const view = desc.view || desc.editorView || null;
            if (view && view.state && view.state.schema) {
                return view;
            }
            return null;
        };
        let view = fromDesc(editor);
        if (view) {
            return view;
        }
        let node = editor.parentElement;
        for (let i = 0; i < 6 && node; i++) {
            view = fromDesc(node);
            if (view) {
                return view;
            }
            node = node.parentElement;
        }
        return this.findViewViaFiber(editor);
    },

    findViewViaFiber(el) {
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
        for (let i = 0; i < 50 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            const fromProps = this.viewFromUnknown(props && props.editor) || this.viewFromUnknown(props);
            if (fromProps) {
                return fromProps;
            }
            let hook = fiber.memoizedState;
            for (let j = 0; j < 30 && hook; j++) {
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

    viewFromUnknown(obj) {
        if (!obj || typeof obj !== 'object') {
            return null;
        }
        if (obj.state && obj.state.schema && typeof obj.dispatch === 'function') {
            return obj;
        }
        if (obj.view && obj.view.state && obj.view.state.schema) {
            return obj.view;
        }
        if (obj.editor && obj.editor.view && obj.editor.view.state) {
            return obj.editor.view;
        }
        return null;
    },

    captureSelection(state, editor) {
        const view = this.findPmView(editor);
        if (view && view.state && view.state.selection) {
            const sel = view.state.selection;
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

    blockRange(view) {
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

    schemaMark(schema, name) {
        return schema && schema.marks && schema.marks[name] ? schema.marks[name] : null;
    },

    clearThemeMarks(tr, from, to, schema) {
        for (const name of THEME_MARKS) {
            const mt = this.schemaMark(schema, name);
            if (mt) {
                tr = tr.removeMark(from, to, mt);
            }
        }
        return tr;
    },

    addPresetMarks(tr, from, to, schema, preset, stored) {
        const marks = [];
        const textStyle = this.schemaMark(schema, 'textStyle');
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

    applyViaPm(view, toolbar, preset) {
        if (!view || !view.state || !view.dispatch) {
            return false;
        }
        const schema = view.state.schema;
        if (preset.heading) {
            const current = this.headingLevel(view);
            if (current !== preset.heading) {
                const heading = schema.nodes && schema.nodes.heading;
                if (heading) {
                    const range = this.blockRange(view);
                    try {
                        view.dispatch(
                            view.state.tr.setBlockType(range.from, range.to, heading, {
                                level: preset.heading
                            })
                        );
                    } catch (err) {
                        this.clickToolbar(toolbar, 'Heading ' + preset.heading);
                    }
                } else {
                    this.clickToolbar(toolbar, 'Heading ' + preset.heading);
                }
            }
        }
        if (preset.toggle && !this.inDetails(view)) {
            this.clickToolbar(toolbar, 'Toggle Block');
        }
        const range = this.blockRange(view);
        let tr = view.state.tr;
        if (!range.stored) {
            tr = this.clearThemeMarks(tr, range.from, range.to, schema);
        }
        tr = this.addPresetMarks(tr, range.from, range.to, schema, preset, !!range.stored);
        view.dispatch(tr);
        view.focus();
        return true;
    },

    closestBlock(node, editor) {
        let el = node;
        if (el && el.nodeType !== Node.ELEMENT_NODE) {
            el = el.parentElement;
        }
        if (!el) {
            return null;
        }
        const found = el.closest('h1, h2, h3, h4, h5, h6, p, summary, li');
        if (found && editor.contains(found)) {
            return found;
        }
        return editor.contains(el) ? el : null;
    },

    targetRange(editor, saved) {
        if (saved && saved.kind === 'dom' && saved.range) {
            const range = saved.range;
            if (range.collapsed) {
                const block = this.closestBlock(range.startContainer, editor);
                if (block) {
                    const next = document.createRange();
                    next.selectNodeContents(block);
                    return { range: next, block };
                }
            }
            return { range, block: this.closestBlock(range.commonAncestorContainer, editor) };
        }
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            return null;
        }
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== editor) {
            return null;
        }
        if (range.collapsed) {
            const block = this.closestBlock(range.startContainer, editor);
            if (!block) {
                return null;
            }
            const next = document.createRange();
            next.selectNodeContents(block);
            return { range: next, block };
        }
        return { range, block: this.closestBlock(range.commonAncestorContainer, editor) };
    },

    refreshBlock(editor, fallback) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const block = this.closestBlock(sel.getRangeAt(0).startContainer, editor);
            if (block) {
                return block;
            }
        }
        if (fallback && fallback.parentNode) {
            return fallback;
        }
        return fallback;
    },

    replaceTag(el, tagName) {
        if (!el || el.tagName.toLowerCase() === tagName) {
            return el;
        }
        const next = document.createElement(tagName);
        while (el.firstChild) {
            next.appendChild(el.firstChild);
        }
        if (el.parentNode) {
            el.parentNode.replaceChild(next, el);
        }
        return next;
    },

    wrapRange(range, tagName, attrs) {
        const el = document.createElement(tagName);
        if (attrs) {
            for (const key of Object.keys(attrs)) {
                el.setAttribute(key, attrs[key]);
            }
        }
        try {
            range.surroundContents(el);
        } catch (err) {
            const frag = range.extractContents();
            el.appendChild(frag);
            range.insertNode(el);
        }
        return el;
    },

    applyViaDom(editor, toolbar, preset, saved) {
        const target = this.targetRange(editor, saved);
        if (!target) {
            return false;
        }
        let block = target.block;
        let range = target.range;
        if (preset.heading && block) {
            const want = 'H' + preset.heading;
            if (block.tagName !== want) {
                this.clickToolbar(toolbar, 'Heading ' + preset.heading);
                block = this.refreshBlock(editor, block);
                if (block && block.parentNode && block.tagName !== want) {
                    block = this.replaceTag(block, 'h' + preset.heading);
                }
                if (block) {
                    range = document.createRange();
                    range.selectNodeContents(block);
                }
            }
        }
        if (preset.toggle && block && block.tagName !== 'SUMMARY' && !block.closest('details')) {
            this.clickToolbar(toolbar, 'Toggle Block');
            const after = this.refreshBlock(editor, block);
            if (after && (after.tagName === 'SUMMARY' || after.closest('details'))) {
                block = after.tagName === 'SUMMARY' ? after : after.closest('details').querySelector('summary') || after;
                range = document.createRange();
                range.selectNodeContents(block);
            } else {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                while (block.firstChild) {
                    summary.appendChild(block.firstChild);
                }
                details.appendChild(summary);
                const content = document.createElement('div');
                content.setAttribute('data-details-content', '');
                const p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                content.appendChild(p);
                details.appendChild(content);
                if (block.parentNode) {
                    block.parentNode.replaceChild(details, block);
                }
                block = summary;
                range = document.createRange();
                range.selectNodeContents(summary);
            }
        }
        if (preset.highlight) {
            this.wrapRange(range, 'mark', {
                'data-color': preset.highlight,
                style: 'background-color: ' + preset.highlight + '; color: inherit;'
            });
            return true;
        }
        let inner = range;
        if (preset.underline) {
            this.wrapRange(inner, 'u', null);
            inner = document.createRange();
            if (block) {
                inner.selectNodeContents(block);
            }
        }
        if (preset.bold) {
            this.wrapRange(inner, 'strong', null);
            inner = document.createRange();
            if (block) {
                inner.selectNodeContents(block);
            }
        }
        if (preset.italic) {
            this.wrapRange(inner, 'em', null);
            inner = document.createRange();
            if (block) {
                inner.selectNodeContents(block);
            }
        }
        if (preset.color) {
            this.wrapRange(inner, 'span', { style: 'color: ' + preset.color });
        }
        return true;
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
        const editor = this.findEditor();
        const toolbar = this.findToolbar(editor);
        if (!editor || !preset) {
            this.flash(input, false);
            Logger.warn('theme apply failed — editor not found');
            return;
        }
        const view = this.findPmView(editor);
        if (view && state.savedSel && state.savedSel.kind === 'pm') {
            this.restorePmSelection(view, state.savedSel);
        } else if (state.savedSel && state.savedSel.kind === 'dom' && state.savedSel.range) {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(state.savedSel.range);
            }
            editor.focus();
        } else {
            editor.focus();
        }
        let ok = false;
        try {
            if (view) {
                ok = this.applyViaPm(view, toolbar, preset);
            }
            if (!ok) {
                ok = this.applyViaDom(editor, toolbar, preset, state.savedSel);
            }
        } catch (err) {
            this.flash(input, false);
            Logger.error('theme apply threw', err);
            return;
        }
        if (!ok) {
            this.flash(input, false);
            Logger.warn('theme apply failed — no selection target');
            return;
        }
        this.flash(input, true);
        Logger.log('applied ' + preset.name);
        input.value = '';
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
            return;
        }
        const injected = this.injectPicker(state, toolbar, editor);
        if ((injected || toolbar.querySelector(`[${WRAP_MARKER}="1"]`)) && !state.activationLogged) {
            Logger.log('theme presets added');
            state.activationLogged = true;
        }
    },

    destroy(state) {
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
