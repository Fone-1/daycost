/**
 * QuickAddPanel - Rapid asset entry component
 * Provides a minimal 3-field form (name, price, date) with expandable advanced options.
 * Version: 1.0.0
 */
class QuickAddPanel {
  /**
   * @param {Object} options
   * @param {Function} options.onSubmit - async ({name, price, date, tags, depreciation_method, expected_lifespan, expected_salvage, status}) => void
   * @param {Function} [options.onExpand] - called when user wants full form (pre-fill name/price)
   * @param {string} [options.position='bottom-right']
   */
  constructor(options = {}) {
    this.options = {
      position: 'bottom-right',
      ...options,
    };

    this.isOpen = false;
    this.isExpanded = false;
    this.panelEl = null;
    this.backdropEl = null;

    // Element refs
    this.nameInput = null;
    this.priceInput = null;
    this.dateInput = null;
    this.tagsInput = null;
    this.statusSelect = null;
    this.depMethodSelect = null;
    this.lifespanInput = null;
    this.salvageInput = null;
    this.endDateGroup = null;
    this.endDateInput = null;
    this.resalePriceGroup = null;
    this.resalePriceInput = null;
    this.advancedSection = null;
    this.expandBtn = null;
    this.submitBtn = null;

    this._buildDOM();
    this._bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /*  DOM Construction                                                  */
  /* ------------------------------------------------------------------ */

  _buildDOM() {
    // Backdrop
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'quick-add-backdrop hidden';

    // Panel
    this.panelEl = document.createElement('div');
    this.panelEl.className = `quick-add-panel ${this.options.position} hidden`;
    this.panelEl.setAttribute('role', 'dialog');
    this.panelEl.setAttribute('aria-modal', 'true');
    this.panelEl.setAttribute('aria-label', '快速添加资产');

    const today = new Date().toISOString().split('T')[0];

    this.panelEl.innerHTML = `
      <div class="quick-add-header">
        <h3>快速添加</h3>
        <button class="quick-add-close" aria-label="关闭">&times;</button>
      </div>
      <div class="quick-add-body">
        <input type="text" id="quickAddName" class="quick-add-input" placeholder="物品名称" required autocomplete="off">
        <div class="quick-add-row">
          <input type="number" id="quickAddPrice" class="quick-add-input" placeholder="购买价格" min="0" step="0.01" required>
          <input type="date" id="quickAddDate" class="quick-add-input" value="${today}">
        </div>
        <div class="quick-add-actions">
          <button id="quickAddSubmit" class="btn quick-add-submit-btn">添加</button>
          <button id="quickAddExpand" class="btn secondary-btn quick-add-expand-btn">更多选项 ▼</button>
        </div>
        <div id="quickAddAdvanced" class="quick-add-advanced hidden">
          <div class="form-group">
            <label for="quickAddTags">标签</label>
            <input type="text" id="quickAddTags" class="quick-add-input" placeholder="例如：数码, 工作">
          </div>
          <div class="form-group">
            <label for="quickAddStatus">状态</label>
            <select id="quickAddStatus" class="sort-select">
              <option value="active">使用中</option>
              <option value="broken">已损坏</option>
              <option value="sold">已回血</option>
            </select>
          </div>
          <div class="quick-add-row hidden" id="quickAddEndDateGroup">
            <div class="form-group">
              <label for="quickAddEndDate">结束日期</label>
              <input type="date" id="quickAddEndDate" class="quick-add-input">
            </div>
            <div class="form-group hidden" id="quickAddResaleGroup">
              <label for="quickAddResalePrice">回血金额</label>
              <input type="number" id="quickAddResalePrice" class="quick-add-input" min="0" step="0.01" placeholder="0.00">
            </div>
          </div>
          <div class="form-group">
            <label for="quickAddDepMethod">折旧算法</label>
            <select id="quickAddDepMethod" class="sort-select">
              <option value="straight_line">直线折旧法</option>
              <option value="double_declining">双倍余额递减法</option>
            </select>
          </div>
          <div class="quick-add-row">
            <div class="form-group">
              <label for="quickAddLifespan">预计寿命（天）</label>
              <input type="number" id="quickAddLifespan" class="quick-add-input" min="1" value="1095">
            </div>
            <div class="form-group">
              <label for="quickAddSalvage">预计残值（元）</label>
              <input type="number" id="quickAddSalvage" class="quick-add-input" min="0" step="0.01" value="0">
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.backdropEl);
    document.body.appendChild(this.panelEl);

    // Cache refs
    this.nameInput = this.panelEl.querySelector('#quickAddName');
    this.priceInput = this.panelEl.querySelector('#quickAddPrice');
    this.dateInput = this.panelEl.querySelector('#quickAddDate');
    this.tagsInput = this.panelEl.querySelector('#quickAddTags');
    this.statusSelect = this.panelEl.querySelector('#quickAddStatus');
    this.depMethodSelect = this.panelEl.querySelector('#quickAddDepMethod');
    this.lifespanInput = this.panelEl.querySelector('#quickAddLifespan');
    this.salvageInput = this.panelEl.querySelector('#quickAddSalvage');
    this.endDateGroup = this.panelEl.querySelector('#quickAddEndDateGroup');
    this.endDateInput = this.panelEl.querySelector('#quickAddEndDate');
    this.resalePriceGroup = this.panelEl.querySelector('#quickAddResaleGroup');
    this.resalePriceInput = this.panelEl.querySelector('#quickAddResalePrice');
    this.advancedSection = this.panelEl.querySelector('#quickAddAdvanced');
    this.expandBtn = this.panelEl.querySelector('#quickAddExpand');
    this.submitBtn = this.panelEl.querySelector('#quickAddSubmit');
  }

  /* ------------------------------------------------------------------ */
  /*  Events                                                            */
  /* ------------------------------------------------------------------ */

  _bindEvents() {
    // Close
    this.panelEl.querySelector('.quick-add-close').addEventListener('click', () => this.hide());
    this.backdropEl.addEventListener('click', () => this.hide());

    // Submit
    this.submitBtn.addEventListener('click', () => this._handleSubmit());

    // Enter to submit
    this.panelEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        this._handleSubmit();
      }
      if (e.key === 'Escape') this.hide();
    });

    // Expand
    this.expandBtn.addEventListener('click', () => this._toggleExpand());

    // Status change toggles end-date / resale-price fields
    this.statusSelect.addEventListener('change', () => this._onStatusChange());
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  show() {
    this.isOpen = true;
    this.panelEl.classList.remove('hidden');
    this.backdropEl.classList.remove('hidden');
    // Reset to collapsed
    this._collapseAdvanced();
    this._clearInputs();
    requestAnimationFrame(() => {
      this.panelEl.classList.add('visible');
      this.backdropEl.classList.add('visible');
      this.nameInput.focus();
    });
  }

  hide() {
    this.isOpen = false;
    this.panelEl.classList.remove('visible');
    this.backdropEl.classList.remove('visible');
    setTimeout(() => {
      this.panelEl.classList.add('hidden');
      this.backdropEl.classList.add('hidden');
    }, 280);
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.show();
  }

  destroy() {
    if (this.panelEl && this.panelEl.parentNode) this.panelEl.parentNode.removeChild(this.panelEl);
    if (this.backdropEl && this.backdropEl.parentNode) this.backdropEl.parentNode.removeChild(this.backdropEl);
    this.panelEl = null;
    this.backdropEl = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                         */
  /* ------------------------------------------------------------------ */

  async _handleSubmit() {
    const name = this.nameInput.value.trim();
    const price = parseFloat(this.priceInput.value);

    // Validate
    if (!name) {
      this.nameInput.classList.add('input-error');
      this.nameInput.focus();
      return;
    }
    this.nameInput.classList.remove('input-error');

    if (isNaN(price) || price < 0) {
      this.priceInput.classList.add('input-error');
      this.priceInput.focus();
      return;
    }
    this.priceInput.classList.remove('input-error');

    const payload = {
      item_name: name,
      price: price,
      purchase_date: this.dateInput.value || new Date().toISOString().split('T')[0],
      tags: this.tagsInput ? this.tagsInput.value.trim() : '',
      status: this.statusSelect ? this.statusSelect.value : 'active',
      end_date: this.endDateInput ? this.endDateInput.value || null : null,
      resale_price: this.resalePriceInput ? parseFloat(this.resalePriceInput.value) || 0 : 0,
      depreciation_method: this.depMethodSelect ? this.depMethodSelect.value : 'straight_line',
      expected_lifespan: this.lifespanInput ? parseInt(this.lifespanInput.value) || 1095 : 1095,
      expected_salvage: this.salvageInput ? parseFloat(this.salvageInput.value) || 0 : 0,
    };

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = '添加中…';

    try {
      if (this.options.onSubmit) {
        await this.options.onSubmit(payload);
      }
      // Clear for next entry, keep panel open for rapid entry
      this._clearInputs();
      this.nameInput.focus();
    } catch (err) {
      // Error toast will be shown by the caller
      console.error('[QuickAddPanel] submit error:', err);
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = '添加';
    }
  }

  _toggleExpand() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.advancedSection.classList.remove('hidden');
      this.expandBtn.textContent = '收起选项 ▲';
    } else {
      this.advancedSection.classList.add('hidden');
      this.expandBtn.textContent = '更多选项 ▼';
    }
  }

  _collapseAdvanced() {
    this.isExpanded = false;
    this.advancedSection.classList.add('hidden');
    this.expandBtn.textContent = '更多选项 ▼';
  }

  _clearInputs() {
    this.nameInput.value = '';
    this.priceInput.value = '';
    this.dateInput.value = new Date().toISOString().split('T')[0];
    if (this.tagsInput) this.tagsInput.value = '';
    if (this.statusSelect) this.statusSelect.value = 'active';
    if (this.endDateInput) this.endDateInput.value = '';
    if (this.resalePriceInput) this.resalePriceInput.value = '';
    if (this.depMethodSelect) this.depMethodSelect.value = 'straight_line';
    if (this.lifespanInput) this.lifespanInput.value = '1095';
    if (this.salvageInput) this.salvageInput.value = '0';
    this._hideEndFields();
    this.nameInput.classList.remove('input-error');
    this.priceInput.classList.remove('input-error');
  }

  _onStatusChange() {
    const val = this.statusSelect.value;
    if (val === 'active') {
      this._hideEndFields();
    } else if (val === 'broken') {
      this.endDateGroup.classList.remove('hidden');
      this.resalePriceGroup.classList.add('hidden');
    } else if (val === 'sold') {
      this.endDateGroup.classList.remove('hidden');
      this.resalePriceGroup.classList.remove('hidden');
    }
  }

  _hideEndFields() {
    this.endDateGroup.classList.add('hidden');
    this.resalePriceGroup.classList.add('hidden');
  }
}

// Expose globally
window.QuickAddPanel = QuickAddPanel;
