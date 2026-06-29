/**
 * RankingView — Daily cost ranking view for DayCost.
 * Displays records ranked by daily cost (¥/day) in descending order.
 * Features color coding (high/medium/low cost), special styling for top 3,
 * and status filtering (active/all).
 *
 * Backend endpoint: GET /api/stats/ranking?limit=20&status=active
 * Response: { data: [{ id, item_name, dailyCost, price, days, status, tags }] }
 *
 * Version: 1.1.0
 */

import apiClient from './api-client.js';
import { escapeHtml, formatCurrency } from './records-view.js';

/* ------------------------------------------------------------------ */
/*  Module State                                                        */
/* ------------------------------------------------------------------ */

/** @type {Array<Object>} Ranking data from server */
let rankingData = [];

/** @type {string} Current status filter: 'active' | 'all' */
let rankingStatusFilter = 'active';

/** @type {boolean} Whether ranking view is currently visible */
let isRankingVisible = false;

/** @type {number} Limit for ranking results */
const rankingLimit = 20;

/* ------------------------------------------------------------------ */
/*  DOM Element References                                              */
/* ------------------------------------------------------------------ */

const rankingToggleBtn = document.getElementById('rankingToggleBtn');
const rankingContainer = document.getElementById('rankingViewContainer');
const rankingListEl = document.getElementById('rankingListContainer');
const rankingStatusSelect = document.getElementById('rankingStatusFilter');

/* ------------------------------------------------------------------ */
/*  Color Coding                                                        */
/* ------------------------------------------------------------------ */

/**
 * Get color level for a daily cost value.
 * @param {number} dailyCost — Daily cost in ¥
 * @returns {string} 'high' | 'medium' | 'low'
 */
function getColorLevel(dailyCost) {
  if (dailyCost >= 50) return 'high';
  if (dailyCost >= 10) return 'medium';
  return 'low';
}

/**
 * Get medal class for top 3 ranking positions.
 * @param {number} rank — 1-based rank
 * @returns {string} 'gold' | 'silver' | 'bronze' | ''
 */
function getMedalClass(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
}

/**
 * Get medal emoji for top 3 positions.
 * @param {number} rank — 1-based rank
 * @returns {string} Medal emoji or empty string
 */
function getMedalEmoji(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                        */
/* ------------------------------------------------------------------ */

/**
 * Get status badge HTML for a record.
 * @param {string} status — 'active' | 'broken' | 'sold'
 * @returns {string} HTML string
 */
function getStatusBadge(status) {
  const badges = {
    active: '<span class="ranking-status-badge active">使用中</span>',
    broken: '<span class="ranking-status-badge broken">已损坏</span>',
    sold: '<span class="ranking-status-badge sold">已回血</span>'
  };
  return badges[status] || badges.active;
}

/**
 * Get tag badges HTML for a record.
 * @param {string} tags — Comma-separated tags string
 * @returns {string} HTML string
 */
function getTagBadges(tags) {
  if (!tags) return '';
  const tagsArr = tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
  return tagsArr.map(t => {
    const cleanTag = t.startsWith('#') ? t : '#' + t;
    return `<span class="ranking-tag-badge">${escapeHtml(cleanTag)}</span>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/*  Data Loading                                                        */
/* ------------------------------------------------------------------ */

/**
 * Load ranking data from the server.
 * @param {string} [status=rankingStatusFilter] — Status filter
 * @returns {Promise<Array<Object>>} Ranking data array
 */
async function loadRanking(status = rankingStatusFilter) {
  if (!rankingListEl) return [];

  rankingListEl.innerHTML = '<div class="ranking-loading">加载中...</div>';

  try {
    const result = await apiClient.get(`/api/stats/ranking?limit=${rankingLimit}&status=${status}`);
    rankingData = result.data || [];
    renderRanking(rankingData);
    return rankingData;
  } catch (err) {
    console.error('[RankingView] 加载排行榜失败', err);
    rankingListEl.innerHTML = `<div class="ranking-error">加载失败：${escapeHtml(err.message || '未知错误')}</div>`;
    return [];
  }
}

/**
 * Render the ranking list.
 * @param {Array<Object>} data — Ranking data array
 */
function renderRanking(data) {
  if (!rankingListEl) return;

  if (!data || data.length === 0) {
    rankingListEl.innerHTML = `
      <div class="ranking-empty">
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2" opacity="0.4">
          <rect x="10" y="15" width="40" height="35" rx="4"/>
          <line x1="10" y1="28" x2="50" y2="28"/>
          <rect x="16" y="35" width="6" height="12" rx="1" opacity="0.3"/>
          <rect x="27" y="32" width="6" height="15" rx="1" opacity="0.5"/>
          <rect x="38" y="38" width="6" height="9" rx="1" opacity="0.7"/>
        </svg>
        <p>暂无排行数据，添加物品后查看日成本排行</p>
      </div>
    `;
    return;
  }

  rankingListEl.innerHTML = data.map((item, index) => {
    const rank = index + 1;
    const medalClass = getMedalClass(rank);
    const medalEmoji = getMedalEmoji(rank);
    const costLevel = getColorLevel(item.dailyCost);
    const statusBadge = getStatusBadge(item.status);
    const tagBadges = getTagBadges(item.tags);

    return `
      <div class="ranking-item ${medalClass}">
        <div class="ranking-badge ${medalClass}">
          ${medalEmoji || `<span class="ranking-badge-num">${rank}</span>`}
        </div>
        <div class="ranking-item-main">
          <div class="ranking-item-name-row">
            <span class="ranking-item-name">${escapeHtml(item.item_name || '未命名')}</span>
            ${statusBadge}
          </div>
          <div class="ranking-item-meta">
            <span class="ranking-meta-item">原价 ${formatCurrency(item.price)}</span>
            <span class="ranking-meta-sep">·</span>
            <span class="ranking-meta-item">${item.days || 0} 天</span>
            ${tagBadges ? `<span class="ranking-meta-sep">·</span><span class="ranking-tags">${tagBadges}</span>` : ''}
          </div>
        </div>
        <div class="ranking-item-cost ranking-cost-${costLevel}">
          <span class="ranking-cost-value">${formatCurrency(item.dailyCost)}</span>
          <span class="ranking-cost-unit">/天</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ------------------------------------------------------------------ */
/*  View Toggle                                                         */
/* ------------------------------------------------------------------ */

/**
 * Show the ranking view and hide the normal stats view.
 */
function showRankingView() {
  isRankingVisible = true;

  // Hide normal stats elements
  const statsTopRow = document.querySelector('.stats-top-row');
  const statsToggle = document.getElementById('statsToggleDetails');
  const statsDetail = document.getElementById('statsDetailSection');
  const statsViewTabs = document.getElementById('statsViewTabs');

  if (statsTopRow) statsTopRow.classList.add('hidden');
  if (statsToggle) statsToggle.classList.add('hidden');
  if (statsDetail) statsDetail.classList.add('hidden');
  if (statsViewTabs) statsViewTabs.classList.add('hidden');

  // Show ranking container
  if (rankingContainer) rankingContainer.classList.remove('hidden');

  // Update button state
  if (rankingToggleBtn) rankingToggleBtn.classList.add('active');

  // Load data
  loadRanking();
}

/**
 * Hide the ranking view and restore the normal stats view.
 */
function hideRankingView() {
  isRankingVisible = false;

  // Show normal stats elements
  const statsTopRow = document.querySelector('.stats-top-row');
  const statsToggle = document.getElementById('statsToggleDetails');
  const statsDetail = document.getElementById('statsDetailSection');
  const statsViewTabs = document.getElementById('statsViewTabs');

  if (statsTopRow) statsTopRow.classList.remove('hidden');
  if (statsToggle) statsToggle.classList.remove('hidden');
  if (statsDetail) statsDetail.classList.remove('hidden');
  if (statsViewTabs) statsViewTabs.classList.remove('hidden');

  // Hide ranking container
  if (rankingContainer) rankingContainer.classList.add('hidden');

  // Update button state
  if (rankingToggleBtn) rankingToggleBtn.classList.remove('active');
}

/**
 * Toggle the ranking view visibility.
 */
function toggleRankingView() {
  if (isRankingVisible) {
    hideRankingView();
  } else {
    showRankingView();
  }
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Initialize the ranking view module.
 * Binds event listeners for the ranking toggle button and status filter.
 */
function initRankingView() {
  // Ranking toggle button
  if (rankingToggleBtn) {
    rankingToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleRankingView();
    });
  }

  // Status filter
  if (rankingStatusSelect) {
    rankingStatusSelect.addEventListener('change', () => {
      rankingStatusFilter = rankingStatusSelect.value;
      if (isRankingVisible) {
        loadRanking();
      }
    });
  }

  // Hide ranking view when switching to another stats view tab
  document.querySelectorAll('[data-stats-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRankingVisible) {
        hideRankingView();
      }
    });
  });
}

export {
  loadRanking,
  renderRanking,
  initRankingView,
  showRankingView,
  hideRankingView,
  toggleRankingView
};
