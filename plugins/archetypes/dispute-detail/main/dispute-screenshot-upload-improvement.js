// ============= dispute-screenshot-upload-improvement.js =============
// Full-width drop/paste/click zone that forwards image files to the native
// dispute resolution screenshot <input type="file"> (original label visually hidden).

const STYLE_ID = 'fleet-dispute-screenshot-upload-improvement-style';
const UPLOAD_CONTROL_ATTR = 'data-fleet-screenshot-upload-improvement';
const NATIVE_LABEL_ATTR = 'data-fleet-screenshot-native-label';
const FILE_INPUT_ATTR = 'data-fleet-screenshot-forward-input';
const ZONE_WRAP_ATTR = 'data-fleet-screenshot-zone';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const UPLOAD_CONTROL_CLASS =
    'flex w-full items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border ' +
    'hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors';
const DRAG_OVER_CLASSES = ['ring-2', 'ring-brand/50'];

function imageFilesFromFileList(list) {
    if (!list || !list.length) return [];
    return Array.from(list).filter(f => f.type && f.type.startsWith('image/'));
}

function imageFilesFromClipboard(clipboardData) {
    if (!clipboardData) return [];
    const fromFiles = imageFilesFromFileList(clipboardData.files);
    if (fromFiles.length) return fromFiles;
    const items = clipboardData.items;
    if (!items) return [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const f = item.getAsFile();
        if (f && f.type.startsWith('image/')) out.push(f);
    }
    return out;
}

function shouldIgnorePasteTarget(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
    const el = target;
    if (el.closest('textarea, select, [contenteditable="true"]')) return true;
    const inp = el.closest('input');
    if (!inp) return false;
    const type = (inp.getAttribute('type') || 'text').toLowerCase();
    const passthrough = new Set(['file', 'button', 'submit', 'reset', 'checkbox', 'radio', 'hidden']);
    return !passthrough.has(type);
}

const plugin = {
    id: 'disputeScreenshotUploadImprovement',
    name: 'Dispute Screenshot Upload Improvement',
    description:
        'Replaces the resolution screenshot control with a full-width zone supporting click, drag-and-drop, and paste; forwards files to the native input',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleReady: false,
        missingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false
    },

    onMutation(state) {
        this.ensureStyles(state);
        const found = this.findNativeScreenshotControl();
        if (!found) {
            if (!state.missingLogged) {
                Logger.debug('Dispute screenshot upload improvement: native file control not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const { label, input } = found;
        if (label.previousElementSibling?.getAttribute(UPLOAD_CONTROL_ATTR)) {
            this.ensurePasteListener(state);
            return;
        }

        const innerWrap = label.parentElement;
        if (innerWrap && !innerWrap.hasAttribute(ZONE_WRAP_ATTR)) {
            innerWrap.setAttribute(ZONE_WRAP_ATTR, '1');
            innerWrap.classList.add('relative');
        }

        label.setAttribute(NATIVE_LABEL_ATTR, '1');
        input.setAttribute(FILE_INPUT_ATTR, '1');

        const uploadControl = document.createElement('button');
        uploadControl.type = 'button';
        uploadControl.setAttribute(UPLOAD_CONTROL_ATTR, '1');
        uploadControl.setAttribute('data-fleet-plugin', this.id);
        uploadControl.className = UPLOAD_CONTROL_CLASS;
        uploadControl.setAttribute(
            'aria-label',
            'Add screenshots — click to choose files, or drop / paste images here'
        );
        uploadControl.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0" aria-hidden="true">
  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
  <line x1="16" x2="22" y1="5" y2="5"></line>
  <line x1="19" x2="19" y1="2" y2="8"></line>
  <circle cx="9" cy="9" r="2"></circle>
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
</svg>
<span class="text-sm">Add screenshots</span>
`;

        let dragDepth = 0;
        const onDragEnter = e => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth++;
            uploadControl.classList.add(...DRAG_OVER_CLASSES);
        };
        const onDragLeave = e => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) uploadControl.classList.remove(...DRAG_OVER_CLASSES);
        };
        const onDragOver = e => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDrop = e => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            uploadControl.classList.remove(...DRAG_OVER_CLASSES);
            const files = imageFilesFromFileList(e.dataTransfer && e.dataTransfer.files);
            if (files.length) {
                this.mergeIntoFileInput(input, files);
            }
        };

        uploadControl.addEventListener('click', () => {
            input.click();
        });
        uploadControl.addEventListener('dragenter', onDragEnter);
        uploadControl.addEventListener('dragleave', onDragLeave);
        uploadControl.addEventListener('dragover', onDragOver);
        uploadControl.addEventListener('drop', onDrop);

        label.parentNode.insertBefore(uploadControl, label);

        this.ensurePasteListener(state);

        if (!state.injectedLogged) {
            Logger.log('Dispute screenshot upload improvement: full-width control injected');
            state.injectedLogged = true;
        }
    },

    ensurePasteListener(state) {
        if (state.pasteListenerAttached) return;
        state.pasteListenerAttached = true;
        document.addEventListener(
            'paste',
            ev => {
                const files = imageFilesFromClipboard(ev.clipboardData);
                if (!files.length) return;
                if (shouldIgnorePasteTarget(ev.target)) return;
                const input = document.querySelector(`input[${FILE_INPUT_ATTR}]`);
                if (!input || !document.contains(input)) return;
                ev.preventDefault();
                ev.stopPropagation();
                this.mergeIntoFileInput(input, files);
            },
            true
        );
        Logger.debug('Dispute screenshot upload improvement: document paste listener attached');
    },

    findNativeScreenshotControl() {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            const input = label.querySelector('input[type="file"][accept*="image"]');
            if (!input || !input.multiple) continue;
            const span = label.querySelector('span.text-sm');
            const t = ((span && span.textContent) || '').trim().replace(/\s+/g, ' ');
            if (t.includes('Add screenshots')) {
                return { label, input };
            }
        }
        return null;
    },

    ensureStyles(state) {
        if (state.styleReady && document.getElementById(STYLE_ID)) return;
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', this.id);
            document.head.appendChild(style);
        }
        style.textContent = `
label[${NATIVE_LABEL_ATTR}] {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
    border: 0 !important;
}
`;
        state.styleReady = true;
    },

    mergeIntoFileInput(input, newFiles) {
        const dt = new DataTransfer();
        const existing = Array.from(input.files || []);
        for (const f of existing) {
            if (dt.items.length >= MAX_FILES) break;
            dt.items.add(f);
        }
        for (const f of newFiles) {
            if (f.size > MAX_BYTES) {
                Logger.warn(
                    `Dispute screenshot upload improvement: skipped "${f.name}" (over ${MAX_BYTES / (1024 * 1024)}MB)`
                );
                continue;
            }
            if (dt.items.length >= MAX_FILES) {
                Logger.warn(
                    `Dispute screenshot upload improvement: max ${MAX_FILES} screenshots; extra file(s) ignored`
                );
                break;
            }
            dt.items.add(f);
        }
        const beforeLen = input.files ? input.files.length : 0;
        if (dt.files.length === beforeLen) {
            return;
        }
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        Logger.debug(`Dispute screenshot upload improvement: ${input.files.length} file(s) on native input`);
    }
};
