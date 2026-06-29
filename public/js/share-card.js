/**
 * ShareCard — Generate shareable PNG image of a record's daily cost.
 * Uses html2canvas to render a DOM element to a canvas, then exports as PNG.
 *
 * Card layout:
 *   - Item name (large)
 *   - ¥/day (prominent)
 *   - Original price + days used (secondary)
 *   - DayCost watermark
 *   - Gradient background
 *
 * Note: formatCurrency and escapeHtml are defined locally to avoid
 * circular dependency with records-view.js (which imports generateShareCard).
 *
 * Version: 1.1.0
 */

/* ------------------------------------------------------------------ */
/*  Utility Functions (local copies to avoid circular dependency)       */
/* ------------------------------------------------------------------ */

/**
 * Escape HTML special characters to prevent XSS in template strings.
 * @param {string} value — Raw string
 * @returns {string} HTML-safe string
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a number as currency string.
 * @param {number} value
 * @returns {string} e.g., "¥12.34"
 */
function formatCurrency(value) {
  const number = Number(value) || 0;
  return `¥${number.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Module State                                                        */
/* ------------------------------------------------------------------ */

/** @type {Object|null} Current record data for the share card */
let currentRecord = null;

/** @type {HTMLElement|null} Preview modal element */
let previewModal = null;

/** @type {HTMLElement|null} Card template element (hidden, used for rendering) */
let cardTemplate = null;

/** @type {Blob|null} Last generated blob (for copy to clipboard) */
let lastGeneratedBlob = null;

/* ------------------------------------------------------------------ */
/*  Card Template Generation                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate the share card HTML for a record.
 * @param {Object} record — Record data with item_name, price, _dailyCost/_aggDailyCost, _days/_aggDays, etc.
 * @returns {string} HTML string for the card
 */
function generateCardHTML(record) {
  const itemName = record.item_name || '未命名物品';
  const dailyCost = record._aggDailyCost !== undefined
    ? record._aggDailyCost
    : (record._dailyCost || 0);
  const price = record._aggPrice !== undefined
    ? record._aggPrice
    : (record.price || 0);
  const days = record._aggDays !== undefined
    ? record._aggDays
    : (record._days || 0);

  // Format the daily cost amount (without ¥ symbol)
  const dailyCostStr = Number(dailyCost).toFixed(2);

  // Determine cost level for color theming
  let costTheme = 'medium';
  if (dailyCost >= 50) costTheme = 'high';
  else if (dailyCost < 10) costTheme = 'low';

  // Tags
  let tagsHTML = '';
  if (record.tags) {
    const tagsArr = record.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
    tagsHTML = tagsArr.map(t => {
      const cleanTag = t.startsWith('#') ? t : '#' + t;
      return `<span class="share-card-tag">${escapeHtml(cleanTag)}</span>`;
    }).join('');
  }

  return `
    <div class="share-card-template" id="shareCardTemplate">
      <div class="share-card-inner share-card-theme-${costTheme}">
        <div class="share-card-header">
          <span class="share-card-logo">📊 DayCost</span>
          <span class="share-card-date">${new Date().toISOString().split('T')[0]}</span>
        </div>
        <div class="share-card-body">
          <div class="share-card-item-name">${escapeHtml(itemName)}</div>
          ${tagsHTML ? `<div class="share-card-tags">${tagsHTML}</div>` : ''}
          <div class="share-card-daily-cost">
            <span class="share-card-currency">¥</span>
            <span class="share-card-amount">${dailyCostStr}</span>
            <span class="share-card-unit">/天</span>
          </div>
          <div class="share-card-meta">
            <div class="share-card-meta-item">
              <span class="share-card-meta-label">原价</span>
              <span class="share-card-meta-value">${formatCurrency(price)}</span>
            </div>
            <div class="share-card-meta-divider"></div>
            <div class="share-card-meta-item">
              <span class="share-card-meta-label">已用</span>
              <span class="share-card-meta-value">${days || 0} 天</span>
            </div>
          </div>
        </div>
        <div class="share-card-footer">
          <span class="share-card-watermark">DayCost · 日摊成本看板</span>
          <span class="share-card-watermark-sub">记录每一笔投入的真实价值</span>
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Preview Modal                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the share card preview modal if it doesn't exist.
 */
function ensurePreviewModal() {
  previewModal = document.getElementById('shareCardPreview');
  if (previewModal) return;

  previewModal = document.createElement('div');
  previewModal.id = 'shareCardPreview';
  previewModal.className = 'modal-overlay hidden';
  previewModal.setAttribute('role', 'dialog');
  previewModal.setAttribute('aria-modal', 'true');
  previewModal.setAttribute('aria-label', '分享卡片预览');
  previewModal.innerHTML = `
    <div class="modal-content glass share-card-modal">
      <button class="modal-close" id="shareCardCloseBtn" aria-label="关闭">&times;</button>
      <h2>分享卡片</h2>
      <div id="shareCardPreviewContent" class="share-card-preview-content"></div>
      <div class="share-card-btn-group">
        <button class="btn" id="shareCardDownloadBtn">保存图片</button>
        <button class="btn secondary-btn" id="shareCardCopyBtn">复制到剪贴板</button>
      </div>
    </div>
  `;
  document.body.appendChild(previewModal);

  // Bind events
  const closeBtn = previewModal.querySelector('#shareCardCloseBtn');
  const downloadBtn = previewModal.querySelector('#shareCardDownloadBtn');
  const copyBtn = previewModal.querySelector('#shareCardCopyBtn');

  closeBtn.addEventListener('click', closePreview);
  downloadBtn.addEventListener('click', downloadShareCard);
  copyBtn.addEventListener('click', copyShareCardToClipboard);

  // Close on overlay click
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
  });
}

/**
 * Show the preview modal with the share card.
 * @param {Object} record — Record data
 */
async function generateShareCard(record) {
  if (!record) return;

  currentRecord = record;
  ensurePreviewModal();

  // Show preview with the card HTML
  const previewContent = previewModal.querySelector('#shareCardPreviewContent');
  if (previewContent) {
    previewContent.innerHTML = generateCardHTML(record);
  }

  previewModal.classList.remove('hidden');

  // Pre-render the canvas for download
  await renderCanvas();
}

/**
 * Render the share card to a canvas using html2canvas.
 * @returns {Promise<Blob|null>} PNG blob
 */
async function renderCanvas() {
  if (!previewModal) return null;

  const template = previewModal.querySelector('#shareCardTemplate');
  if (!template) return null;

  // Check if html2canvas is available
  if (typeof window.html2canvas === 'undefined') {
    console.error('[ShareCard] html2canvas not loaded');
    if (window.toast) window.toast.error('分享功能需要 html2canvas 库');
    return null;
  }

  try {
    const canvas = await window.html2canvas(template, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      width: 640,
      height: 960
    });

    lastGeneratedBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    return lastGeneratedBlob;
  } catch (err) {
    console.error('[ShareCard] Canvas rendering failed', err);
    if (window.toast) window.toast.error('图片生成失败');
    return null;
  }
}

/**
 * Download the share card as a PNG file.
 */
async function downloadShareCard() {
  let blob = lastGeneratedBlob;
  if (!blob) {
    blob = await renderCanvas();
  }

  if (!blob) {
    if (window.toast) window.toast.error('图片生成失败，请重试');
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const itemName = currentRecord?.item_name || 'item';
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `DayCost_${itemName}_${dateStr}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (window.toast) window.toast.success('图片已保存');
}

/**
 * Copy the share card image to clipboard.
 */
async function copyShareCardToClipboard() {
  let blob = lastGeneratedBlob;
  if (!blob) {
    blob = await renderCanvas();
  }

  if (!blob) {
    if (window.toast) window.toast.error('图片生成失败，请重试');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.write) {
      const ClipboardItem = window.ClipboardItem;
      if (ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        if (window.toast) window.toast.success('已复制到剪贴板');
        return;
      }
    }
    // Fallback: not supported
    if (window.toast) window.toast.info('当前浏览器不支持复制图片，请使用"保存图片"按钮');
  } catch (err) {
    console.error('[ShareCard] Copy to clipboard failed', err);
    if (window.toast) window.toast.error('复制失败，请使用"保存图片"按钮');
  }
}

/**
 * Close the preview modal.
 */
function closePreview() {
  if (previewModal) {
    previewModal.classList.add('hidden');
  }
  currentRecord = null;
  lastGeneratedBlob = null;
}

/**
 * Initialize the share card module.
 */
function initShareCard() {
  ensurePreviewModal();
}

export {
  generateShareCard,
  downloadShareCard,
  initShareCard,
  closePreview
};
