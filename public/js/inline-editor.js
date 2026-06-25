/**
 * InlineEditor - Edit asset card fields without opening the full modal.
 * Activated by double-click or long-press on a card row.
 * Supports editing: name, price, status, tags.
 * Version: 1.0.0
 */
class InlineEditor {
  /**
   * @param {Object} options
   * @param {number} options.recordId
   * @param {Object} options.record - the global record object
   * @param {HTMLElement} options.cardElement - the card DOM element
   * @param {Function} options.onSave - async (recordId, updates) => void
   * @param {Function} [options.onCancel]
   */
  constructor(options = {}) {
    this.recordId = options.recordId;
    this.record = options.record;
    this.cardEl = options.cardElement;
    this.onSave = options.onSave || (() => {});
    this.onCancel = options.onCancel || (() => {});

    this.isEditing = false;
    this.wrapperEl = null;
    this._originalValues = {};
    this._editorEl = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  enterEditMode() {
    if (this.isEditing) return;
    if (!this.record || !this.cardEl) return;

    this.isEditing = true;
    this._originalValues = {
      item_name: this.record.item_name,
      price: this.record.price,
      status: this.record.status,
      tags: this.record.tags || '',
    };

    // Find the record-wrapper ancestor
    this.wrapperEl = this.cardEl.closest('.record-wrapper') || this.cardEl.parentElement;
    this.wrapperEl.classList.add('inline-editing');

    this._renderEditor();
  }

  cancel() {
    if (!this.isEditing) return;
    this._removeEditor();
    this.isEditing = false;
    if (this.wrapperEl) this.wrapperEl.classList.remove('inline-editing');
    this.onCancel();
  }

  async save() {
    if (!this.isEditing) return;

    const nameVal = this._editorEl.querySelector('.ie-name').value.trim();
    const priceVal = parseFloat(this._editorEl.querySelector('.ie-price').value);
    const statusVal = this._editorEl.querySelector('.ie-status').value;
    const tagsVal = this._editorEl.querySelector('.ie-tags').value.trim();

    if (!nameVal) {
      this._editorEl.querySelector('.ie-name').classList.add('input-error');
      return;
    }
    if (isNaN(priceVal) || priceVal < 0) {
      this._editorEl.querySelector('.ie-price').classList.add('input-error');
      return;
    }

    // Build updates object — only send changed fields
    const updates = {};
    if (nameVal !== this._originalValues.item_name) updates.item_name = nameVal;
    if (priceVal !== this._originalValues.price) updates.price = priceVal;
    if (statusVal !== this._originalValues.status) updates.status = statusVal;
    if (tagsVal !== this._originalValues.tags) updates.tags = tagsVal;

    const saveBtn = this._editorEl.querySelector('.ie-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';

    try {
      if (Object.keys(updates).length > 0) {
        await this.onSave(this.recordId, updates);
      }
      this._removeEditor();
      this.isEditing = false;
      if (this.wrapperEl) this.wrapperEl.classList.remove('inline-editing');
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
      console.error('[InlineEditor] save error:', err);
    }
  }

  destroy() {
    this.cancel();
    this.cardEl = null;
    this.record = null;
  }

  /* ------------------------------------------------------------------ */
  /*  DOM                                                               */
  /* ------------------------------------------------------------------ */

  _renderEditor() {
    this._editorEl = document.createElement('div');
    this._editorEl.className = 'inline-editor-panel';
    this._editorEl.setAttribute('role', 'dialog');
    this._editorEl.setAttribute('aria-label', '内联编辑');

    const statusOpts = [
      { val: 'active', label: '使用中' },
      { val: 'broken', label: '已损坏' },
      { val: 'sold', label: '已回血' },
    ];
    const statusOptionsHtml = statusOpts.map(o =>
      `<option value="${o.val}" ${o.val === this.record.status ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    this._editorEl.innerHTML = `
      <div class="ie-field">
        <label class="ie-label">名称</label>
        <input type="text" class="ie-name quick-add-input" value="${this._escHtml(this.record.item_name)}" required>
      </div>
      <div class="ie-row">
        <div class="ie-field">
          <label class="ie-label">价格</label>
          <input type="number" class="ie-price quick-add-input" value="${this.record.price}" min="0" step="0.01" required>
        </div>
        <div class="ie-field">
          <label class="ie-label">状态</label>
          <select class="ie-status sort-select">${statusOptionsHtml}</select>
        </div>
      </div>
      <div class="ie-field">
        <label class="ie-label">标签</label>
        <input type="text" class="ie-tags quick-add-input" value="${this._escHtml(this.record.tags || '')}" placeholder="标签，逗号分隔">
      </div>
      <div class="ie-actions">
        <button class="btn ie-save-btn">保存</button>
        <button class="btn secondary-btn ie-cancel-btn">取消</button>
      </div>
    `;

    // Insert after the card
    this.wrapperEl.appendChild(this._editorEl);

    // Events
    this._editorEl.querySelector('.ie-save-btn').addEventListener('click', () => this.save());
    this._editorEl.querySelector('.ie-cancel-btn').addEventListener('click', () => this.cancel());
    this._editorEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancel();
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        this.save();
      }
    });

    // Focus first input
    requestAnimationFrame(() => {
      const first = this._editorEl.querySelector('.ie-name');
      if (first) first.focus();
    });
  }

  _removeEditor() {
    if (this._editorEl && this._editorEl.parentNode) {
      this._editorEl.parentNode.removeChild(this._editorEl);
    }
    this._editorEl = null;
  }

  _escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

// Expose globally
window.InlineEditor = InlineEditor;
