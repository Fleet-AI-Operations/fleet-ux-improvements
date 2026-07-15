// dispute-resolution-messages.js
// Shared named resolution-message snippets (Storage-backed). Used by dashboard
// dispute claim UI and Fleet dispute-detail resolution textarea.

const DRM_STORAGE_KEY = 'fleet-ux:dispute-resolution-messages';
const DRM_DIALOG_ID = 'fleet-dispute-resolution-msg-dialog';
const DRM_STYLE_ID = 'fleet-dispute-resolution-msg-styles';
const DRM_PLUGIN_TAG = 'disputeResolutionMessages';

function drmEscHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function drmNewId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (_e) { /* ignore */ }
    return 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function drmNormalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    const body = String(raw.body || '');
    if (!id || !name || !String(body).trim()) return null;
    const updatedAt = Number(raw.updatedAt) || Date.now();
    return { id, name, body, updatedAt };
}

function drmReadList() {
    let parsed = null;
    try {
        const raw = Storage.getData(DRM_STORAGE_KEY, null);
        if (raw == null || raw === '') return [];
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        Logger.warn(DRM_PLUGIN_TAG + ': failed to parse stored messages', e);
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
        const entry = drmNormalizeEntry(item);
        if (!entry || seen.has(entry.id)) continue;
        seen.add(entry.id);
        out.push(entry);
    }
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return out;
}

function drmWriteList(list) {
    const normalized = [];
    const seen = new Set();
    for (const item of list || []) {
        const entry = drmNormalizeEntry(item);
        if (!entry || seen.has(entry.id)) continue;
        seen.add(entry.id);
        normalized.push(entry);
    }
    normalized.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    Storage.setData(DRM_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
}

function drmAppendBody(existing, body) {
    const extra = String(body || '');
    if (!extra) return String(existing || '');
    const cur = String(existing || '');
    if (!cur.trim()) return extra;
    const prefix = cur.endsWith('\n') ? cur : cur + '\n';
    return prefix + extra;
}

function drmSetTextareaValue(textarea, next) {
    if (!textarea) return;
    const value = String(next == null ? '' : next);
    textarea.focus();
    const previousValue = textarea.value;
    const proto = Object.getPrototypeOf(textarea);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
        descriptor.set.call(textarea, value);
    } else {
        textarea.value = value;
    }
    if (textarea._valueTracker && typeof textarea._valueTracker.setValue === 'function') {
        try {
            textarea._valueTracker.setValue(previousValue);
        } catch (_e) { /* ignore */ }
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function drmBtnClass(variant, size) {
    if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
        return Context.uiLib.btnClass(variant, size);
    }
    return 'wf-dash-btn wf-dash-btn--' + (variant || 'basic') + ' wf-dash-btn--' + (size || 'compact');
}

function drmEnsureStyles() {
    if (Context.uiLib && typeof Context.uiLib.ensureStyles === 'function') {
        Context.uiLib.ensureStyles();
    }
    const cssText = [
        '#' + DRM_DIALOG_ID + ' {',
        '  position: fixed;',
        '  top: 50%;',
        '  left: 50%;',
        '  transform: translate(-50%, -50%);',
        '  padding: 0;',
        '  border: none;',
        '  background: transparent;',
        '  max-width: min(480px, calc(100vw - 32px));',
        '  z-index: 2147483646;',
        '}',
        '#' + DRM_DIALOG_ID + '::backdrop {',
        '  background: rgba(15, 23, 42, 0.45);',
        '}',
        '#' + DRM_DIALOG_ID + ' .fleet-drm-dialog-card {',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 12px;',
        '  padding: 18px;',
        '  width: 440px;',
        '  max-width: min(440px, calc(100vw - 32px));',
        '  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.12), 0 10px 10px -5px rgba(0,0,0,0.05);',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 12px;',
        '}',
        '#' + DRM_DIALOG_ID + ' .fleet-drm-dialog-title {',
        '  font-size: 14px;',
        '  font-weight: 600;',
        '  margin: 0;',
        '}',
        '#' + DRM_DIALOG_ID + ' label {',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 4px;',
        '  font-size: 12px;',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        '#' + DRM_DIALOG_ID + ' input,',
        '#' + DRM_DIALOG_ID + ' textarea {',
        '  font: inherit;',
        '  font-size: 13px;',
        '  color: inherit;',
        '  background: var(--background, #fff);',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 6px;',
        '  padding: 8px 10px;',
        '}',
        '#' + DRM_DIALOG_ID + ' textarea {',
        '  min-height: 120px;',
        '  resize: vertical;',
        '}',
        '#' + DRM_DIALOG_ID + ' .fleet-drm-dialog-actions {',
        '  display: flex;',
        '  justify-content: flex-end;',
        '  gap: 8px;',
        '  margin-top: 4px;',
        '}',
        '#' + DRM_DIALOG_ID + ' .fleet-drm-error {',
        '  color: rgb(220, 38, 38);',
        '  font-size: 12px;',
        '  min-height: 1em;',
        '}',
        '.fleet-drm-toolbar {',
        '  display: flex;',
        '  flex-wrap: wrap;',
        '  align-items: center;',
        '  gap: 8px;',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"].fleet-drm-toolbar {',
        '  margin-top: 8px;',
        '}',
        '.fleet-drm-toolbar select {',
        '  min-width: 140px;',
        '  max-width: 220px;',
        '  flex: 1 1 140px;',
        '  font: inherit;',
        '  font-size: 12px;',
        '  padding: 4px 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, rgba(148, 163, 184, 0.4));',
        '  background: var(--background, transparent);',
        '  color: inherit;',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"] button.fleet-drm-btn {',
        '  appearance: none;',
        '  -webkit-appearance: none;',
        '  box-sizing: border-box;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  margin: 0;',
        '  font: inherit;',
        '  font-size: 12px;',
        '  font-weight: 500;',
        '  line-height: 1.25;',
        '  white-space: nowrap;',
        '  padding: 4px 10px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, rgba(148, 163, 184, 0.45));',
        '  background: color-mix(in srgb, var(--muted, #64748b) 14%, transparent);',
        '  color: var(--foreground, inherit);',
        '  cursor: pointer;',
        '  transition: background 0.15s, border-color 0.15s, opacity 0.15s;',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"] button.fleet-drm-btn:hover {',
        '  background: color-mix(in srgb, var(--muted, #64748b) 24%, transparent);',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"] button.fleet-drm-btn--primary {',
        '  border-color: color-mix(in srgb, var(--brand, #2563eb) 55%, var(--border, rgba(148,163,184,0.45)));',
        '  background: color-mix(in srgb, var(--brand, #2563eb) 22%, transparent);',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"] button.fleet-drm-btn--primary:hover {',
        '  background: color-mix(in srgb, var(--brand, #2563eb) 32%, transparent);',
        '}',
        '[data-fleet-dispute-msg-toolbar="1"] button.fleet-drm-btn:disabled {',
        '  opacity: 0.5;',
        '  cursor: not-allowed;',
        '}'
    ].join('\n');

    let style = document.getElementById(DRM_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = DRM_STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== cssText) {
        style.textContent = cssText;
    }
}

function drmOptionsHtml(selectedId) {
    const selected = String(selectedId || '');
    const items = drmReadList();
    let html = '<option value=""' + (selected ? '' : ' selected') + '>Saved messages…</option>';
    for (const item of items) {
        const sel = item.id === selected ? ' selected' : '';
        html += '<option value="' + drmEscHtml(item.id) + '"' + sel + '>'
            + drmEscHtml(item.name) + '</option>';
    }
    return html;
}

function drmFillSelect(selectEl, selectedId) {
    if (!selectEl) return;
    const keep = selectedId != null ? String(selectedId) : String(selectEl.value || '');
    selectEl.innerHTML = drmOptionsHtml(keep);
    if (keep && Array.from(selectEl.options).some((o) => o.value === keep)) {
        selectEl.value = keep;
    } else {
        selectEl.value = '';
    }
}

function drmToolbarHtml(opts) {
    const o = opts || {};
    const mode = o.mode === 'fleet' ? 'fleet' : 'dashboard';
    const disputeId = String(o.disputeId || '');
    const itemId = String(o.itemId || '');
    const selectedId = String(o.selectedId || '');
    const disabled = o.disabled ? ' disabled' : '';
    const selectClass = '';
    const btnBasic = drmBtnClass('basic', 'compact');
    const btnSecondary = drmBtnClass('secondary', 'compact');

    if (mode === 'dashboard') {
        return '<div class="fleet-drm-toolbar" data-wf-dash-dispute-msg-toolbar="1"'
            + ' data-dispute-id="' + drmEscHtml(disputeId) + '"'
            + ' data-item-id="' + drmEscHtml(itemId) + '">'
            + '<select data-wf-dash-dispute-msg-select="1"'
            + ' data-dispute-id="' + drmEscHtml(disputeId) + '"'
            + ' data-item-id="' + drmEscHtml(itemId) + '"'
            + ' aria-label="Saved resolution messages"'
            + ' class="' + selectClass + '"' + disabled + '>'
            + drmOptionsHtml(selectedId)
            + '</select>'
            + '<button type="button" data-wf-dash-dispute-msg-insert="1"'
            + ' data-dispute-id="' + drmEscHtml(disputeId) + '"'
            + ' data-item-id="' + drmEscHtml(itemId) + '"'
            + ' class="' + btnSecondary + '"' + disabled + '>Insert</button>'
            + '<button type="button" data-wf-dash-dispute-msg-delete="1"'
            + ' data-dispute-id="' + drmEscHtml(disputeId) + '"'
            + ' data-item-id="' + drmEscHtml(itemId) + '"'
            + ' class="' + btnBasic + '"' + disabled + '>Delete</button>'
            + '<button type="button" data-wf-dash-dispute-msg-create="1"'
            + ' data-dispute-id="' + drmEscHtml(disputeId) + '"'
            + ' data-item-id="' + drmEscHtml(itemId) + '"'
            + ' class="' + btnBasic + '"' + disabled + '>Create</button>'
            + '</div>';
    }

    return '';
}

function drmCloseCreateDialog() {
    const existing = document.getElementById(DRM_DIALOG_ID);
    if (!existing) return;
    try {
        if (typeof existing.close === 'function') existing.close();
    } catch (_e) { /* ignore */ }
    existing.remove();
}

function drmOpenCreateDialog(opts) {
    const o = opts || {};
    const initialBody = o.initialBody != null ? String(o.initialBody) : '';
    const onSaved = typeof o.onSaved === 'function' ? o.onSaved : null;

    drmEnsureStyles();
    drmCloseCreateDialog();

    const dialog = document.createElement('dialog');
    dialog.id = DRM_DIALOG_ID;
    dialog.setAttribute('data-fleet-plugin', DRM_PLUGIN_TAG);
    dialog.innerHTML = ''
        + '<form class="fleet-drm-dialog-card" method="dialog" data-fleet-drm-form="1">'
        + '<h3 class="fleet-drm-dialog-title">Save resolution message</h3>'
        + '<label>Name'
        + '<input type="text" name="name" data-fleet-drm-name="1" required maxlength="120" autocomplete="off" placeholder="e.g. Incomplete scenario" />'
        + '</label>'
        + '<label>Message'
        + '<textarea name="body" data-fleet-drm-body="1" required placeholder="Text to insert into the resolution box…"></textarea>'
        + '</label>'
        + '<div class="fleet-drm-error" data-fleet-drm-error="1"></div>'
        + '<div class="fleet-drm-dialog-actions">'
        + '<button type="button" data-fleet-drm-cancel="1" class="' + drmBtnClass('basic', 'compact') + '">Cancel</button>'
        + '<button type="submit" data-fleet-drm-save="1" class="' + drmBtnClass('secondary', 'compact') + '">Save</button>'
        + '</div>'
        + '</form>';

    document.body.appendChild(dialog);

    const nameInput = dialog.querySelector('[data-fleet-drm-name]');
    const bodyInput = dialog.querySelector('[data-fleet-drm-body]');
    const errorEl = dialog.querySelector('[data-fleet-drm-error]');
    const form = dialog.querySelector('[data-fleet-drm-form]');
    const cancelBtn = dialog.querySelector('[data-fleet-drm-cancel]');

    if (bodyInput && initialBody.trim()) {
        bodyInput.value = initialBody;
    }

    function setError(msg) {
        if (errorEl) errorEl.textContent = msg || '';
    }

    cancelBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        drmCloseCreateDialog();
    });

    dialog.addEventListener('cancel', (ev) => {
        ev.preventDefault();
        drmCloseCreateDialog();
    });

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        setError('');
        const name = nameInput ? String(nameInput.value || '').trim() : '';
        const body = bodyInput ? String(bodyInput.value || '') : '';
        if (!name) {
            setError('Name is required.');
            if (nameInput) nameInput.focus();
            return;
        }
        if (!String(body).trim()) {
            setError('Message is required.');
            if (bodyInput) bodyInput.focus();
            return;
        }
        try {
            const created = drmCreate({ name, body });
            Logger.log(DRM_PLUGIN_TAG + ': created message — ' + created.name);
            drmCloseCreateDialog();
            if (onSaved) onSaved(created);
        } catch (e) {
            Logger.warn(DRM_PLUGIN_TAG + ': create failed', e);
            setError(e && e.message ? e.message : 'Failed to save message.');
        }
    });

    try {
        dialog.showModal();
    } catch (_e) {
        dialog.setAttribute('open', '');
    }
    if (nameInput) nameInput.focus();
}

function drmCreate({ name, body }) {
    const trimmedName = String(name || '').trim();
    const trimmedBody = String(body || '');
    if (!trimmedName) throw new Error('Name is required');
    if (!trimmedBody.trim()) throw new Error('Message is required');
    const list = drmReadList();
    const entry = {
        id: drmNewId(),
        name: trimmedName,
        body: trimmedBody,
        updatedAt: Date.now()
    };
    list.push(entry);
    drmWriteList(list);
    return entry;
}

function drmRemove(id) {
    const target = String(id || '').trim();
    if (!target) return false;
    const list = drmReadList();
    const next = list.filter((item) => item.id !== target);
    if (next.length === list.length) return false;
    drmWriteList(next);
    return true;
}

function drmGetById(id) {
    const target = String(id || '').trim();
    if (!target) return null;
    return drmReadList().find((item) => item.id === target) || null;
}

function drmMountToolbar(opts) {
    const o = opts || {};
    const textarea = o.textarea;
    if (!textarea || !textarea.parentNode) return null;

    drmEnsureStyles();

    const existing = textarea.parentNode.querySelector('[data-fleet-dispute-msg-toolbar="1"]');
    if (existing) {
        drmFillSelect(existing.querySelector('[data-fleet-dispute-msg-select]'));
        const insertExisting = existing.querySelector('[data-fleet-dispute-msg-insert]');
        const deleteExisting = existing.querySelector('[data-fleet-dispute-msg-delete]');
        const createExisting = existing.querySelector('[data-fleet-dispute-msg-create]');
        if (insertExisting) insertExisting.className = 'fleet-drm-btn fleet-drm-btn--primary';
        if (deleteExisting) deleteExisting.className = 'fleet-drm-btn';
        if (createExisting) createExisting.className = 'fleet-drm-btn';
        return existing;
    }

    const wrap = document.createElement('div');
    wrap.className = 'fleet-drm-toolbar';
    wrap.setAttribute('data-fleet-dispute-msg-toolbar', '1');
    wrap.setAttribute('data-fleet-plugin', DRM_PLUGIN_TAG);

    const select = document.createElement('select');
    select.setAttribute('data-fleet-dispute-msg-select', '1');
    select.setAttribute('aria-label', 'Saved resolution messages');
    drmFillSelect(select);

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.textContent = 'Insert';
    insertBtn.className = 'fleet-drm-btn fleet-drm-btn--primary';
    insertBtn.setAttribute('data-fleet-dispute-msg-insert', '1');

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'fleet-drm-btn';
    deleteBtn.setAttribute('data-fleet-dispute-msg-delete', '1');

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.textContent = 'Create';
    createBtn.className = 'fleet-drm-btn';
    createBtn.setAttribute('data-fleet-dispute-msg-create', '1');

    wrap.appendChild(select);
    wrap.appendChild(insertBtn);
    wrap.appendChild(deleteBtn);
    wrap.appendChild(createBtn);

    textarea.insertAdjacentElement('afterend', wrap);

    insertBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(select.value || '').trim();
        const entry = drmGetById(id);
        if (!entry) {
            Logger.warn(DRM_PLUGIN_TAG + ': insert blocked — no message selected');
            return;
        }
        const next = drmAppendBody(textarea.value, entry.body);
        drmSetTextareaValue(textarea, next);
        Logger.log(DRM_PLUGIN_TAG + ': inserted message — ' + entry.name);
    });

    deleteBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(select.value || '').trim();
        const entry = drmGetById(id);
        if (!entry) {
            Logger.warn(DRM_PLUGIN_TAG + ': delete blocked — no message selected');
            return;
        }
        if (!window.confirm('Delete saved message "' + entry.name + '"?')) return;
        if (drmRemove(id)) {
            Logger.log(DRM_PLUGIN_TAG + ': deleted message — ' + entry.name);
            drmFillSelect(select, '');
        } else {
            Logger.warn(DRM_PLUGIN_TAG + ': delete failed — ' + id);
        }
    });

    createBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        drmOpenCreateDialog({
            initialBody: textarea.value || '',
            onSaved(created) {
                drmFillSelect(select, created && created.id);
            }
        });
    });

    Logger.log(DRM_PLUGIN_TAG + ': toolbar mounted under resolution textarea');
    return wrap;
}

const plugin = {
    id: 'disputeResolutionMessages',
    name: 'Dispute Resolution Messages',
    description:
        'Shared cached named messages for dispute resolution textareas (create, insert, delete)',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        drmEnsureStyles();
        Context.disputeResolutionMessages = {
            STORAGE_KEY: DRM_STORAGE_KEY,
            list: drmReadList,
            get: drmGetById,
            create: drmCreate,
            remove: drmRemove,
            appendBody: drmAppendBody,
            setTextareaValue: drmSetTextareaValue,
            openCreateDialog: drmOpenCreateDialog,
            optionsHtml: drmOptionsHtml,
            fillSelect: drmFillSelect,
            toolbarHtml: drmToolbarHtml,
            mountToolbar: drmMountToolbar,
            ensureStyles: drmEnsureStyles
        };
        if (!state.registered) {
            Logger.log(DRM_PLUGIN_TAG + ': module registered (Context.disputeResolutionMessages)');
            state.registered = true;
        }
    }
};
