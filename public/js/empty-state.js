/**
 * EmptyState — Unified empty state component for DayCost.
 * Provides tab-specific empty state rendering with SVG illustrations,
 * guidance text, and CTA buttons.
 *
 * Supported tabs: 'records', 'stats', 'trash', 'totp'
 *
 * Version: 1.1.0
 */

/* ------------------------------------------------------------------ */
/*  SVG Illustrations                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get SVG illustration for a given tab's empty state.
 * @param {string} tabName — 'records' | 'stats' | 'trash' | 'totp'
 * @returns {string} SVG HTML string
 */
function getEmptyStateIcon(tabName) {
  const icons = {
    records: `<svg class="empty-state-icon" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="20" y="25" width="60" height="50" rx="8"/>
      <line x1="30" y1="42" x2="55" y2="42"/>
      <line x1="30" y1="55" x2="70" y2="55"/>
      <line x1="30" y1="63" x2="60" y2="63"/>
      <circle cx="78" cy="28" r="14" stroke-dasharray="4 4" stroke-width="1.5"/>
      <line x1="88" y1="38" x2="93" y2="43" stroke-width="2.5"/>
    </svg>`,
    stats: `<svg class="empty-state-icon" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="12" y="18" width="76" height="64" rx="6"/>
      <line x1="12" y1="32" x2="88" y2="32"/>
      <rect x="22" y="55" width="8" height="18" rx="2" fill="currentColor" stroke="none" opacity="0.2"/>
      <rect x="36" y="45" width="8" height="28" rx="2" fill="currentColor" stroke="none" opacity="0.4"/>
      <rect x="50" y="50" width="8" height="23" rx="2" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="64" y="40" width="8" height="33" rx="2" fill="currentColor" stroke="none" opacity="0.8"/>
      <line x1="18" y1="73" x2="80" y2="73" stroke-dasharray="2 3" opacity="0.4"/>
    </svg>`,
    trash: `<svg class="empty-state-icon" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M32 35 L32 80 Q32 85 37 85 L63 85 Q68 85 68 80 L68 35"/>
      <line x1="27" y1="35" x2="73" y2="35"/>
      <path d="M42 35 L42 25 Q42 20 47 20 L53 20 Q58 20 58 25 L58 35"/>
      <line x1="42" y1="48" x2="42" y2="72"/>
      <line x1="50" y1="48" x2="50" y2="72"/>
      <line x1="58" y1="48" x2="58" y2="72"/>
      <circle cx="50" cy="50" r="40" stroke-dasharray="6 4" stroke-width="1" opacity="0.3"/>
    </svg>`,
    totp: `<svg class="empty-state-icon" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="25" y="20" width="50" height="65" rx="8"/>
      <line x1="35" y1="35" x2="65" y2="35"/>
      <text x="50" y="55" font-size="14" fill="currentColor" stroke="none" font-family="monospace" text-anchor="middle">···</text>
      <circle cx="50" cy="70" r="6" stroke-dasharray="3 3" stroke-width="1.5"/>
      <path d="M70 28 L78 20 M78 20 L74 20 M78 20 L78 24" stroke-width="1.5"/>
    </svg>`
  };
  return icons[tabName] || icons.records;
}

/* ------------------------------------------------------------------ */
/*  Empty State Configurations                                          */
/* ------------------------------------------------------------------ */

/**
 * Configuration for each tab's empty state.
 * @type {Object<string, Object>}
 */
const emptyStateConfigs = {
  records: {
    title: '还没有记录任何物品',
    description: '添加你的第一件物品，开始追踪日摊成本',
    ctaText: '添加第一件物品',
    ctaAction: () => {
      const fabBtn = document.getElementById('fabAddBtn');
      if (fabBtn) fabBtn.click();
    }
  },
  stats: {
    title: '添加物品后查看日摊分析',
    description: '统计图表会在有记录后自动展示',
    ctaText: '去添加',
    ctaAction: () => {
      const homeBtn = document.querySelector('[data-target="pane-home"]');
      if (homeBtn) homeBtn.click();
      setTimeout(() => {
        const fabBtn = document.getElementById('fabAddBtn');
        if (fabBtn) fabBtn.click();
      }, 300);
    }
  },
  trash: {
    title: '回收站是空的',
    description: '删除的记录会在这里保留 30 天',
    ctaText: null,
    ctaAction: null
  },
  totp: {
    title: '还没有密钥',
    description: '添加一个 TOTP 密钥，开始管理你的验证码',
    ctaText: '添加密钥',
    ctaAction: () => {
      const addBtn = document.getElementById('totpAddKeyBtn');
      if (addBtn) addBtn.click();
    }
  }
};

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate empty state HTML string for a given tab.
 * Used by Clusterize for virtual scroll rows.
 * @param {string} tabName — 'records' | 'stats' | 'trash' | 'totp'
 * @returns {string} HTML string
 */
function getEmptyStateHTML(tabName) {
  const config = emptyStateConfigs[tabName];
  if (!config) return '';

  const ctaHTML = config.ctaText
    ? `<button class="btn btn-primary empty-state-cta" data-empty-cta="${tabName}">${config.ctaText}</button>`
    : '';

  return `
    <div class="empty-state-container">
      <div class="empty-state-illustration">${getEmptyStateIcon(tabName)}</div>
      <h3 class="empty-state-text">${config.title}</h3>
      <p class="empty-state-desc">${config.description}</p>
      ${ctaHTML}
    </div>
  `;
}

/**
 * Render empty state into a container element.
 * Binds CTA button click handler if present.
 * @param {string} tabName — 'records' | 'stats' | 'trash' | 'totp'
 * @param {HTMLElement} containerEl — Container element to render into
 */
function renderEmptyState(tabName, containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = getEmptyStateHTML(tabName);

  // Bind CTA button
  const ctaBtn = containerEl.querySelector('[data-empty-cta]');
  if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      const config = emptyStateConfigs[tabName];
      if (config && config.ctaAction) {
        config.ctaAction();
      }
    });
  }
}

/**
 * Check if a container should show an empty state and render it if needed.
 * @param {string} tabName — Tab identifier
 * @param {HTMLElement} containerEl — Container element
 * @param {boolean} isEmpty — Whether the data is empty
 * @returns {boolean} True if empty state was shown
 */
function checkEmptyState(tabName, containerEl, isEmpty) {
  if (!containerEl) return false;

  if (isEmpty) {
    renderEmptyState(tabName, containerEl);
    containerEl.classList.add('show-empty-state');
    return true;
  } else {
    containerEl.classList.remove('show-empty-state');
    // Only clear if it contains an empty state
    if (containerEl.querySelector('.empty-state-container')) {
      containerEl.innerHTML = '';
    }
    return false;
  }
}

export {
  getEmptyStateHTML,
  renderEmptyState,
  checkEmptyState,
  emptyStateConfigs
};
