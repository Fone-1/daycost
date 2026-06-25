/**
 * BatchManager - Multi-select mode and batch operations for asset list.
 * Activated by long-press on a card; shows a floating toolbar with actions.
 * Version: 1.0.0
 */
class BatchManager {
  /**
   * @param {Object} options
   * @param {Function} options.onBatchStatusChange - async (ids[], status) => void
   * @param {Function} options.onBatchDelete - async (ids[]) => void
   * @param {Function} [options.onCancel]
   * @param {Function} [options.getRecords] - () => record[] (for select-all)
   */
  constructor(options = {}) {
    this.options = options;

    this.isActive = false;
    this.selectedIds = new Set();

    this.toolbarEl = null;
    this.countEl = null;
    this.selectAllBtn = null;
    this.statusBtn = null;
    this.statusMenu = null;
    this.deleteBtn = null;
    this.cancelBtn = null;

    this._buildDOM();
    this._bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /*  DOM                                                               */
  /* ------------------------------------------------------------------ */

  _buildDOM() {
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'batch-toolbar hidden';
    this.toolbarEl.setAttribute('role', 'toolbar');
    this.toolbarEl.setAttribute('aria-label', '批量操作');

    const statusOpts = [
      { val: 'active', label: '使用中' },
      { val: 'broken', label: '已损坏' },
      { val: 'sold', label: '已回血' },
    ];

    this.toolbarEl.innerHTML = `
      <div class="batch-info">
        <button class="batch-select-all-btn btn-icon" title="全选" aria-label="全选">☐</button>
        <span class="batch-count">0</span> 项已选
      </div>
      <div class="batch-actions">
        <div class="batch-status-dropdown">
          <button class="batch-status-btn btn secondary-btn">批量状态</button>
          <div class="batch-status-menu hidden">
            ${statusOpts.map(o => `<button class="batch-status-option" data-status="${o.val}">${o.label}</button>`).join('')}
          </div>
        </div>
        <button class="batch-delete-btn btn danger-btn">批量删除</button>
        <button class="batch-cancel-btn btn secondary-btn">取消</button>
      </div>
    `;

    document.body.appendChild(this.toolbarEl);

    this.countEl = this.toolbarEl.querySelector('.batch-count');
    this.selectAllBtn = this.toolbarEl.querySelector('.batch-select-all-btn');
    this.statusBtn = this.toolbarEl.querySelector('.batch-status-btn');
    this.statusMenu = this.toolbarEl.querySelector('.batch-status-menu');
    this.deleteBtn = this.toolbarEl.querySelector('.batch-delete-btn');
    this.cancelBtn = this.toolbarEl.querySelector('.batch-cancel-btn');
  }

  _bindEvents() {
    // Select All / Deselect All toggle
    this.selectAllBtn.addEventListener('click', () => this._toggleSelectAll());

    // Status dropdown toggle
    this.statusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.statusMenu.classList.toggle('hidden');
    });

    // Status option click
    this.statusMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('.batch-status-option');
      if (!btn) return;
      const status = btn.dataset.status;
      this.statusMenu.classList.add('hidden');
      await this._handleBatchStatus(status);
    });

    // Delete
    this.deleteBtn.addEventListener('click', () => this._handleBatchDelete());

    // Cancel
    this.cancelBtn.addEventListener('click', () => this.deactivate());

    // Close status menu on outside click
    document.addEventListener('click', () => {
      if (this.statusMenu) this.statusMenu.classList.add('hidden');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  activate(initialId = null) {
    this.isActive = true;
    this.selectedIds.clear();
    if (initialId !== null) this.selectedIds.add(initialId);

    this.toolbarEl.classList.remove('hidden');
    requestAnimationFrame(() => this.toolbarEl.classList.add('visible'));
    this._updateCount();

    // Add body class for card checkbox visibility
    document.body.classList.add('batch-mode');
  }

  deactivate() {
    this.isActive = false;
    this.selectedIds.clear();
    this.toolbarEl.classList.remove('visible');
    setTimeout(() => this.toolbarEl.classList.add('hidden'), 280);
    this.statusMenu.classList.add('hidden');
    this._updateCount();

    document.body.classList.remove('batch-mode');

    // Remove all checkbox highlights
    document.querySelectorAll('.record-card.batch-selected').forEach(el => {
      el.classList.remove('batch-selected');
    });

    if (this.options.onCancel) this.options.onCancel();
  }

  /**
   * Toggle selection of a record.
   * @param {number} id
   * @param {HTMLElement} [cardEl] - card element for visual feedback
   */
  toggle(id, cardEl = null) {
    if (!this.isActive) return;

    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      if (cardEl) cardEl.classList.remove('batch-selected');
    } else {
      this.selectedIds.add(id);
      if (cardEl) cardEl.classList.add('batch-selected');
    }
    this._updateCount();
  }

  /**
   * Get currently selected IDs.
   * @returns {number[]}
   */
  getSelectedIds() {
    return Array.from(this.selectedIds);
  }

  destroy() {
    if (this.toolbarEl && this.toolbarEl.parentNode) {
      this.toolbarEl.parentNode.removeChild(this.toolbarEl);
    }
    document.body.classList.remove('batch-mode');
    this.toolbarEl = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                         */
  /* ------------------------------------------------------------------ */

  _updateCount() {
    this.countEl.textContent = this.selectedIds.size;
    const has = this.selectedIds.size > 0;
    this.statusBtn.disabled = !has;
    this.deleteBtn.disabled = !has;

    // Update select-all icon
    const records = this.options.getRecords ? this.options.getRecords() : [];
    const topLevelIds = records.filter(r => !r.parent_id).map(r => r.id);
    if (topLevelIds.length > 0 && this.selectedIds.size === topLevelIds.length) {
      this.selectAllBtn.textContent = '☑';
      this.selectAllBtn.title = '取消全选';
    } else {
      this.selectAllBtn.textContent = '☐';
      this.selectAllBtn.title = '全选';
    }
  }

  _toggleSelectAll() {
    const records = this.options.getRecords ? this.options.getRecords() : [];
    const topLevelIds = records.filter(r => !r.parent_id).map(r => r.id);

    if (this.selectedIds.size === topLevelIds.length && topLevelIds.length > 0) {
      // Deselect all
      this.selectedIds.clear();
      document.querySelectorAll('.record-card.batch-selected').forEach(el => {
        el.classList.remove('batch-selected');
      });
    } else {
      // Select all top-level
      this.selectedIds = new Set(topLevelIds);
      // Highlight all visible cards
      document.querySelectorAll('.record-card[data-record-id]').forEach(el => {
        const id = parseInt(el.dataset.recordId, 10);
        if (topLevelIds.includes(id)) {
          el.classList.add('batch-selected');
        }
      });
    }
    this._updateCount();
  }

  async _handleBatchStatus(status) {
    const ids = this.getSelectedIds();
    if (ids.length === 0) return;

    const statusLabel = { active: '使用中', broken: '已损坏', sold: '已回血' }[status] || status;

    try {
      if (this.options.onBatchStatusChange) {
        await this.options.onBatchStatusChange(ids, status);
      }
      if (window.toast) {
        window.toast.success(`已将 ${ids.length} 项资产状态改为「${statusLabel}」`);
      }
      this.deactivate();
    } catch (err) {
      if (window.toast) {
        window.toast.error(`批量状态变更失败: ${err.message}`);
      }
    }
  }

  async _handleBatchDelete() {
    const ids = this.getSelectedIds();
    if (ids.length === 0) return;

    // Use custom confirm dialog if available
    const doDelete = async () => {
      try {
        if (this.options.onBatchDelete) {
          await this.options.onBatchDelete(ids);
        }
        if (window.toast) {
          window.toast.success(`已将 ${ids.length} 项资产移入回收站`);
        }
        this.deactivate();
      } catch (err) {
        if (window.toast) {
          window.toast.error(`批量删除失败: ${err.message}`);
        }
      }
    };

    if (window.showAppConfirm) {
      window.showAppConfirm(
        '批量删除',
        `确定要将选中的 ${ids.length} 项资产移入回收站吗？`,
        doDelete,
        '确认删除'
      );
    } else {
      if (confirm(`确定要将选中的 ${ids.length} 项资产移入回收站吗？`)) {
        await doDelete();
      }
    }
  }
}

// Expose globally
window.BatchManager = BatchManager;
