/**
 * RecordsView — Records/stats/charts/trash management module for DayCost.
 * Handles record list rendering, filtering, sorting, tree display,
 * stats visualization, chart rendering, trash operations, and data export/import.
 * Uses ApiClient for HTTP requests instead of raw fetch.
 *
 * Version: 1.0.0
 */

import apiClient from './api-client.js';
import { bindTooltip } from './modal-manager.js';
import { getEmptyStateHTML } from './empty-state.js';
import { generateShareCard } from './share-card.js';

/* ------------------------------------------------------------------ */
/*  Module State                                                        */
/* ------------------------------------------------------------------ */

/** @type {Array<Object>} All loaded records (top-level + children) */
let globalRecords = [];

/** @type {Array<Object>} Records in the trash/recycle bin */
let globalTrashRecords = [];

/** @type {Object<number, boolean>} Map of parent_id → expanded state */
const expandedParents = {};

/** @type {number} Current page for pagination */
let currentPage = 1;

/** @type {number} Items per page (large to preserve tree structure) */
const itemsPerPage = 10000;

/** @type {boolean} Whether more records are available from server */
let hasMoreRecords = true;

/** @type {boolean} Whether a record load request is in progress */
let isLoadingRecords = false;

/** @type {Chart|null} Cost chart (doughnut/bar) instance */
let costChartInstance = null;

/** @type {Chart|null} Trend chart (line) instance */
let trendChartInstance = null;

/** @type {string} Current trend chart time range */
let currentTrendRange = '30d';

/** @type {string} Current stats dimension view: 'tag'|'status'|'group'|'month' */
let statsActiveView = 'tag';

/** @type {Object|null} Linked filter from stats click-through */
let statsLinkedFilter = null;

/** @type {Clusterize|null} Virtual scroll instance for record list */
let clusterizeInstance = null;

/** @type {Clusterize|null} Virtual scroll instance for trash list */
let trashClusterizeInstance = null;

/** @type {Object|null} Temporary data for import operations */
let tempDataToImport = null;

/* ------------------------------------------------------------------ */
/*  DOM Element References                                              */
/* ------------------------------------------------------------------ */

const filterSelect = document.getElementById('filterSelect');
const sortSelect = document.getElementById('sortSelect');
const searchInput = document.getElementById('searchInput');
const dateInput = document.getElementById('purchaseDate');
const parentSelect = document.getElementById('parentSelect');
const costForm = document.getElementById('costForm');
const historyListScroll = document.getElementById('historyListScroll');
const trashListScroll = document.getElementById('trashListScroll');
const initialStatusSelect = document.getElementById('initialStatus');
const formEndDateGroup = document.getElementById('formEndDateGroup');
const formResalePriceGroup = document.getElementById('formResalePriceGroup');
const formEndDate = document.getElementById('formEndDate');
const purchaseDateInput = document.getElementById('purchaseDate');
const statusSelect = document.getElementById('statusSelect');
const statusRecordId = document.getElementById('statusRecordId');
const statusEditName = document.getElementById('statusEditName');
const statusEditParentId = document.getElementById('statusEditParentId');
const statusEditPrice = document.getElementById('statusEditPrice');
const statusEditDate = document.getElementById('statusEditDate');
const statusEndDate = document.getElementById('statusEndDate');
const statusResalePrice = document.getElementById('statusResalePrice');
const endDateGroup = document.getElementById('endDateGroup');
const resalePriceGroup = document.getElementById('resalePriceGroup');
const statusForm = document.getElementById('statusForm');
const statusModal = document.getElementById('statusModal');
const resultModal = document.getElementById('resultModal');
const addItemModal = document.getElementById('addItemModal');
const addItemModalClose = document.getElementById('addItemModalClose');
const importFileInput = document.getElementById('importFileInput');
const importChoiceModal = document.getElementById('importChoiceModal');

/* ------------------------------------------------------------------ */
/*  Utility Functions                                                   */
/* ------------------------------------------------------------------ */

const todayStr = new Date().toISOString().split('T')[0];

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

/**
 * Animate a numeric value change in a DOM element.
 * @param {HTMLElement} obj — Target element with textContent
 * @param {number} start — Starting value
 * @param {number} end — Ending value
 * @param {number} duration — Animation duration in ms
 * @param {boolean} isCurrency — Whether to format as currency (2 decimal places)
 */
function animateValue(obj, start, end, duration, isCurrency) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const currentVal = start + (end - start) * easeProgress;
    obj.textContent = isCurrency ? currentVal.toFixed(2) : Math.floor(currentVal);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.textContent = isCurrency ? end.toFixed(2) : end;
    }
  };
  window.requestAnimationFrame(step);
}

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} delay — Delay in ms
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Download a text file via Blob URL.
 * @param {string} content — File content
 * @param {string} filename — Download filename
 * @param {string} [mime] — MIME type
 */
function downloadTextFile(content, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Cost Calculation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Calculate daily cost and related metrics for a record.
 * @param {Object} record — Record object with price, purchase_date, status, etc.
 * @returns {{dailyCost: number, actualDaysForCalc: number, finalCost: number, currentValue: number}}
 */
function calculateCost(record) {
  const purchaseDate = new Date(record.purchase_date);
  purchaseDate.setHours(0, 0, 0, 0);

  let endDate = new Date();
  const status = record.status || 'active';

  if (status !== 'active' && record.end_date) {
    endDate = new Date(record.end_date);
  }
  endDate.setHours(0, 0, 0, 0);

  const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
  const daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
  const actualDaysForCalc = daysUsed + 1;

  let finalCost = record.price;
  if (status === 'sold') {
    finalCost = Math.max(0, record.price - (record.resale_price || 0));
  }

  // Calculate depreciation / current value
  let currentValue = record.price;
  if (status === 'sold') {
    currentValue = record.resale_price || 0;
  } else if (status === 'broken') {
    currentValue = 0;
  } else {
    const depMethod = record.depreciation_method || 'straight_line';
    const lifespan = record.expected_lifespan || 1095;
    const salvage = record.expected_salvage || 0;

    if (depMethod === 'straight_line') {
      const dailyDep = (record.price - salvage) / lifespan;
      currentValue = Math.max(salvage, record.price - (dailyDep * actualDaysForCalc));
    } else if (depMethod === 'double_declining') {
      const dailyRate = 2 / lifespan;
      currentValue = record.price * Math.pow(1 - dailyRate, actualDaysForCalc);
      currentValue = Math.max(salvage, currentValue);
    }
  }

  return {
    dailyCost: finalCost / actualDaysForCalc,
    actualDaysForCalc,
    finalCost,
    currentValue
  };
}

/* ------------------------------------------------------------------ */
/*  Parent Dropdown Updates                                             */
/* ------------------------------------------------------------------ */

/**
 * Update parent/group dropdown selects with current top-level records.
 * Populates both the add-item and edit-status parent select elements.
 */
function updateParentDropdowns() {
  const topLevelRecords = globalRecords.filter(r => !r.parent_id);
  const optionsHtml = '<option value="">- 独立物品 -</option>' +
    topLevelRecords.map(r => `<option value="${r.id}">${escapeHtml(r.item_name || '未命名')}</option>`).join('');

  if (parentSelect) parentSelect.innerHTML = optionsHtml;
  if (statusEditParentId) statusEditParentId.innerHTML = optionsHtml;
}

/* ------------------------------------------------------------------ */
/*  Record HTML Generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate HTML for a single record item card.
 * @param {Object} record — Record data object
 * @param {boolean} [isChild=false] — Whether this is a child/sub-item
 * @returns {string} HTML string
 */
function createItemHtml(record, isChild = false) {
  const status = record.status || 'active';
  let classModifiers = isChild ? 'child-item' : '';
  if (status === 'broken') classModifiers += ' broken';
  if (status === 'sold') classModifiers += ' sold';

  let badges = '';
  let tagBadges = '';

  const dailyCost = record._aggDailyCost !== undefined ? record._aggDailyCost : record._dailyCost;
  const price = record._aggPrice !== undefined ? record._aggPrice : record.price;
  const days = record._aggDays !== undefined ? record._aggDays : record._days;
  const finalCost = record._aggFinalCost !== undefined ? record._aggFinalCost : record._finalCost;
  const currentValue = record._aggCurrentValue !== undefined ? record._aggCurrentValue : record._currentValue;

  const priceLabel = isChild ? '零件单价' : '组合总价';
  let metaText = `${priceLabel} ${formatCurrency(price)}${isChild ? '' : ` · 已用 ${days || 0} 天`}`;

  if (status === 'broken') {
    badges = '<span class="status-badge bg-red">已损坏</span>';
  } else if (status === 'sold') {
    badges = '<span class="status-badge bg-yellow">已回血</span>';
    const resaleLabel = isChild ? '零件折损' : '组合折损';
    metaText = `${resaleLabel} ${formatCurrency(finalCost)} · 回血 ${formatCurrency(record.resale_price || 0)} · ${days || 0} 天`;
  } else {
    metaText += ` · 估值 ${formatCurrency(currentValue || 0)}`;
  }

  if (record.tags) {
    const tagsArr = record.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
    tagsArr.forEach(t => {
      const cleanTag = t.startsWith('#') ? t : '#' + t;
      tagBadges += `<span class="tag-badge">${escapeHtml(cleanTag)}</span>`;
    });
  }

  const safeName = escapeHtml(record.item_name || '未命名');
  const safeMeta = escapeHtml(metaText);

  return `
    <div class="history-item ${classModifiers}" data-id="${record.id}">
      <div class="swipe-wrapper">
        <div class="swipe-content">
          <div class="history-info">
            <span class="history-name" data-fulltext="${safeName}">${safeName} ${badges}${tagBadges}</span>
            <span class="history-meta" data-fulltext="${safeMeta}">${safeMeta}</span>
          </div>
          <div class="history-cost">
            <div class="history-cost-val">${formatCurrency(dailyCost)}<span>/天</span></div>
          </div>
        </div>
        <div class="swipe-actions">
          <button class="status-btn" data-action="edit" data-record-id="${record.id}" title="编辑">编辑</button>
          <button class="share-btn" data-action="share" data-record-id="${record.id}" title="分享">分享</button>
          ${isChild ? '' : `<button class="delete-btn" data-action="delete" data-record-id="${record.id}" title="删除">删除</button>`}
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Stats Helpers                                                       */
/* ------------------------------------------------------------------ */

const statsViewMeta = {
  tag: { title: '标签日均成本分布', empty: '暂无标签数据。给物品添加标签后会在这里汇总。' },
  status: { title: '状态日均成本分布', empty: '暂无状态数据。' },
  group: { title: '组合日均成本分布', empty: '暂无组合数据。' },
  month: { title: '月份投入分布', empty: '暂无月份数据。' }
};

const statusLabels = { active: '使用中', broken: '已损坏', sold: '已回血' };

function recordDailyCost(record) {
  return Number(record._aggDailyCost ?? record._dailyCost ?? 0);
}

function recordPrice(record) {
  return Number(record._aggPrice ?? record.price ?? 0);
}

function topLevelStatsRecords() {
  return globalRecords.filter(r => !r.parent_id);
}

function addStatsBucket(map, key, label, record, metric = 'daily') {
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, { key, label, dailyCost: 0, totalPrice: 0, count: 0 });
  }
  const bucket = map.get(key);
  bucket.dailyCost += recordDailyCost(record);
  bucket.totalPrice += recordPrice(record);
  bucket.count += 1;
  if (metric === 'price') bucket.value = bucket.totalPrice;
  else bucket.value = bucket.dailyCost;
}

function getStatsBuckets(view = statsActiveView) {
  const buckets = new Map();
  const records = view === 'group' ? topLevelStatsRecords() : globalRecords;

  records.forEach(record => {
    if (view === 'tag') {
      const tags = (record.tags || '').split(/[,，\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      tags.forEach(tag => addStatsBucket(buckets, tag.toLowerCase(), `#${tag}`, record));
    } else if (view === 'status') {
      const key = record.status || 'active';
      addStatsBucket(buckets, key, statusLabels[key] || key, record);
    } else if (view === 'group') {
      addStatsBucket(buckets, String(record.id), record.item_name || '未命名组合', record);
    } else if (view === 'month') {
      const month = String(record.purchase_date || '').slice(0, 7);
      addStatsBucket(buckets, month, month, record, 'price');
    }
  });

  return [...buckets.values()]
    .map(bucket => ({ ...bucket, value: bucket.value ?? bucket.dailyCost }))
    .filter(bucket => bucket.value > 0)
    .sort((a, b) => b.value - a.value);
}

function statsFilterLabel(filter = statsLinkedFilter) {
  if (!filter) return '当前图表跟随账本列表筛选。';
  const label = filter.label || filter.value;
  const viewLabel = ({ tag: '标签', status: '状态', group: '组合', month: '月份' })[filter.type] || '筛选';
  return `已联动筛选：${viewLabel} ${label}`;
}

function updateStatsControls() {
  document.querySelectorAll('[data-stats-view]').forEach(btn => {
    const isActive = btn.dataset.statsView === statsActiveView;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  const title = document.getElementById('statsBreakdownTitle');
  if (title) title.textContent = statsViewMeta[statsActiveView]?.title || '统计分布';
  const label = document.getElementById('statsLinkLabel');
  if (label) label.textContent = statsFilterLabel();
}

function applyStatsFilter(type, value, label) {
  statsLinkedFilter = { type, value, label };
  if (type === 'status') {
    if (filterSelect) filterSelect.value = value;
    if (searchInput) searchInput.value = '';
  } else {
    if (filterSelect) filterSelect.value = 'all';
    if (searchInput) searchInput.value = '';
  }
  updateStatsControls();
  loadHistory(1, false);
}

function clearStatsFilter() {
  statsLinkedFilter = null;
  if (filterSelect) filterSelect.value = 'all';
  if (searchInput) searchInput.value = '';
  updateStatsControls();
  loadHistory(1, false);
}

/* ------------------------------------------------------------------ */
/*  Data Loading                                                        */
/* ------------------------------------------------------------------ */

/**
 * Load records from the server with pagination, filtering, and sorting.
 * @param {number} [page=1] — Page number
 * @param {boolean} [append=false] — Whether to append to existing records (infinite scroll)
 */
async function loadHistory(page = 1, append = false) {
  if (isLoadingRecords) return;
  isLoadingRecords = true;

  try {
    const sortByMap = {
      'default': 'created_at',
      'priceDesc': 'price',
      'costDesc': 'dailyCost',
      'costAsc': 'dailyCost',
      'daysDesc': 'days',
      'daysAsc': 'days'
    };
    const sortByValue = sortSelect ? sortSelect.value : 'dateDesc';
    const sortBy = sortByMap[sortByValue] || 'created_at';
    const sortOrder = sortByValue.toLowerCase().includes('asc') ? 'ASC' : 'DESC';
    const query = searchInput ? (searchInput.value || '').trim() : '';
    const filter = filterSelect ? filterSelect.value : 'all';
    const statsParams = statsLinkedFilter
      ? `&statsType=${encodeURIComponent(statsLinkedFilter.type)}&statsValue=${encodeURIComponent(statsLinkedFilter.value)}`
      : '';

    const url = `/api/records?page=${page}&limit=${itemsPerPage}&sortBy=${sortBy}&sortOrder=${sortOrder}&q=${encodeURIComponent(query)}&status=${filter}${statsParams}`;

    const result = await apiClient.get(url);
    const newRecords = result.data || [];

    if (append) {
      globalRecords = [...globalRecords, ...newRecords];
    } else {
      globalRecords = newRecords;
      if (historyListScroll) historyListScroll.scrollTop = 0;
    }

    currentPage = result.page;
    hasMoreRecords = result.hasMore;

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      if (hasMoreRecords) loadingIndicator.classList.remove('hidden');
      else loadingIndicator.classList.add('hidden');
    }

    updateParentDropdowns();
    renderHistory();
  } catch (e) {
    console.error('[RecordsView] 加载历史记录失败', e);
  } finally {
    isLoadingRecords = false;
  }
}

/**
 * Load statistics data from the server.
 */
async function loadStats() {
  const globalStatsBox = document.getElementById('globalStatsBox');
  const globalTotalDaily = document.getElementById('globalTotalDaily');
  const globalTotalPrice = document.getElementById('globalTotalPrice');

  const queryParams = new URLSearchParams({
    q: searchInput ? searchInput.value : '',
    status: filterSelect ? filterSelect.value : 'all'
  });

  try {
    const stats = await apiClient.get(`/api/stats?${queryParams.toString()}`);

    if (globalStatsBox) globalStatsBox.classList.remove('hidden');

    const oldDailyVal = parseFloat(globalTotalDaily?.textContent) || 0;
    if (globalTotalDaily) animateValue(globalTotalDaily, oldDailyVal, stats.total_daily_cost, 800, true);

    const oldPriceVal = parseFloat(globalTotalPrice?.textContent) || 0;
    if (globalTotalPrice) animateValue(globalTotalPrice, oldPriceVal, stats.total_price, 800, true);

    const statTotal = document.getElementById('statTotal');
    const statActive = document.getElementById('statActive');
    const statBroken = document.getElementById('statBroken');
    const statSold = document.getElementById('statSold');

    if (statTotal) statTotal.textContent = stats.total_count;
    if (statActive) statActive.textContent = stats.status_counts?.active || 0;
    if (statBroken) statBroken.textContent = stats.status_counts?.broken || 0;
    if (statSold) statSold.textContent = stats.status_counts?.sold || 0;

    // Render tag stats from server data
    const tagContainer = document.getElementById('tagStatsContainer');
    if (tagContainer && stats.tag_stats) {
      const cleanTagEntries = Object.entries(stats.tag_stats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.daily_cost - a.daily_cost);

      if (cleanTagEntries.length === 0) {
        tagContainer.innerHTML = '<div class="empty-state">暂无标签数据。给物品添加标签后会在这里汇总。</div>';
      } else {
        const maxDailyCost = cleanTagEntries[0].daily_cost;
        tagContainer.innerHTML = cleanTagEntries.map(tag => {
          const percent = maxDailyCost > 0 ? (tag.daily_cost / maxDailyCost) * 100 : 0;
          return `
            <div class="tag-list-item">
              <div class="tag-list-header">
                <span class="tag-list-name">#${escapeHtml(tag.name)}</span>
                <span class="tag-list-cost">¥${tag.daily_cost.toFixed(2)}<span style="font-size:0.7rem; color:#94a3b8;">/天</span></span>
              </div>
              <div class="tag-progress-track">
                <div class="tag-progress-fill" style="width: ${percent}%;"></div>
              </div>
              <div class="tag-list-sub" style="margin-top: 4px; text-align: right;">
                包含投入：¥${tag.total_price.toFixed(2)}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.error('[RecordsView] 加载统计数据失败', e);
  }
}

/**
 * Load trash/recycle bin records from the server.
 */
async function loadTrash() {
  try {
    globalTrashRecords = await apiClient.get('/api/records/trash');
    renderTrash();
  } catch (e) {
    console.error('[RecordsView] 加载回收站失败', e);
    if (window.showAppAlert) window.showAppAlert('获取回收站数据失败');
  }
}

/* ------------------------------------------------------------------ */
/*  Record List Rendering                                               */
/* ------------------------------------------------------------------ */

/**
 * Render the record list using Clusterize virtual scroll.
 * Separates records into top-level and children, handles expand/collapse.
 */
function renderHistory() {
  const globalStatsBox = document.getElementById('globalStatsBox');
  if (globalStatsBox) globalStatsBox.classList.remove('hidden');

  // Separate top-level and children
  const childrenMap = {};
  const topLevelRecords = [];

  globalRecords.forEach(r => {
    if (r.parent_id) {
      if (!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
      childrenMap[r.parent_id].push(r);
    } else {
      topLevelRecords.push(r);
    }
  });

  const virtualRows = [];

  if (topLevelRecords.length === 0) {
    virtualRows.push(`<div class="record-wrapper">${getEmptyStateHTML('records')}</div>`);
  } else {
    topLevelRecords.forEach(record => {
      const children = childrenMap[record.id] || [];
      virtualRows.push(`<div class="record-wrapper">${createItemHtml(record, false)}</div>`);

      if (children.length > 0) {
        const totalChildren = children.length;
        const isExpanded = !!expandedParents[record.id];
        const btnText = isExpanded ? `▲ 收起零件明细` : `▼ 展开零件明细 (${totalChildren}个部件)`;

        virtualRows.push(`<div class="record-wrapper"><button class="toggle-children-btn" data-parent-id="${record.id}" aria-expanded="${isExpanded}" style="width:100%; border-radius:10px; margin-top:5px; margin-bottom:5px;">${btnText}</button></div>`);

        if (isExpanded) {
          children.forEach(child => {
            virtualRows.push(`<div class="record-wrapper children-container show" style="padding-left:15px; border-left:3px solid var(--primary); margin-left:10px;">${createItemHtml(child, true)}</div>`);
          });
        }
      }
    });
  }

  if (!clusterizeInstance) {
    clusterizeInstance = new Clusterize({
      rows: virtualRows,
      scrollId: 'historyListScroll',
      contentId: 'historyListContent',
      callbacks: {
        clusterChanged: () => {
          const scrollEl = document.getElementById('historyListScroll');
          if (scrollEl) {
            scrollEl.querySelectorAll('[data-fulltext]').forEach(el => {
              bindTooltip(el, el.dataset.fulltext);
            });
            // Bind empty state CTA buttons
            scrollEl.querySelectorAll('[data-empty-cta]').forEach(btn => {
              btn.onclick = () => {
                const tabName = btn.dataset.emptyCta;
                if (tabName === 'records') {
                  const fabBtn = document.getElementById('fabAddBtn');
                  if (fabBtn) fabBtn.click();
                }
              };
            });
          }
        }
      }
    });
  } else {
    clusterizeInstance.update(virtualRows);
  }

  // Render visualizations
  renderStatsBreakdown();
  renderChart();
  renderTrendChart(currentTrendRange);
}

/* ------------------------------------------------------------------ */
/*  Trash Rendering                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render trash items using Clusterize virtual scroll.
 */
function renderTrash() {
  const trashRows = globalTrashRecords.map(record => {
    const deletedDate = new Date(record.deleted_at);
    const now = new Date();
    const diffDays = Math.floor((now - deletedDate) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(0, 30 - diffDays);
    let countdownClass = 'status-badge';
    if (daysLeft <= 3) countdownClass += ' bg-red';
    else if (daysLeft <= 7) countdownClass += ' bg-yellow';
    else countdownClass += ' bg-blue';

    return `
      <div class="record-wrapper">
        <div class="history-item deleted">
          <div class="history-info">
            <span class="history-name">${escapeHtml(record.item_name || '未命名')} <span class="${countdownClass}">${daysLeft}天后清理</span></span>
            <span class="history-meta">买入 ${formatCurrency(record.price)} · 删除于 ${record.deleted_at ? record.deleted_at.split(' ')[0] : '未知'}</span>
          </div>
          <div class="history-actions" style="display:flex; gap:8px;">
            <button class="status-btn" data-action="restore" data-record-id="${record.id}" title="恢复记录">恢复</button>
            <button class="delete-btn" data-action="purge" data-record-id="${record.id}" title="永久删除">删除</button>
          </div>
        </div>
      </div>
    `;
  });

  if (trashRows.length === 0) {
    trashRows.push(`<div class="record-wrapper">${getEmptyStateHTML('trash')}</div>`);
  }

  if (!trashClusterizeInstance) {
    trashClusterizeInstance = new Clusterize({
      rows: trashRows,
      scrollId: 'trashListScroll',
      contentId: 'trashListContent'
    });
  } else {
    trashClusterizeInstance.update(trashRows);
  }
}

/* ------------------------------------------------------------------ */
/*  Stats Breakdown Rendering                                           */
/* ------------------------------------------------------------------ */

function renderStatsBreakdown() {
  updateStatsControls();
  const container = document.getElementById('tagStatsContainer');
  if (!container) return;

  const buckets = getStatsBuckets();
  const meta = statsViewMeta[statsActiveView] || statsViewMeta.tag;

  if (buckets.length === 0) {
    container.innerHTML = `<div class="empty-state">${meta.empty}</div>`;
    return;
  }

  const maxValue = buckets[0].value;
  container.innerHTML = buckets.map(bucket => {
    const percent = maxValue > 0 ? (bucket.value / maxValue) * 100 : 0;
    const isActive = statsLinkedFilter?.type === statsActiveView && String(statsLinkedFilter.value) === String(bucket.key);
    const mainValue = statsActiveView === 'month' ? formatCurrency(bucket.totalPrice) : `${formatCurrency(bucket.dailyCost)}<span style="font-size:0.7rem; color:#94a3b8;">/天</span>`;
    const subValue = statsActiveView === 'month'
      ? `${bucket.count} 条记录`
      : `${bucket.count} 条 · 总投入 ${formatCurrency(bucket.totalPrice)}`;
    return `
      <div class="tag-list-item ${isActive ? 'active' : ''}" data-stats-key="${escapeHtml(bucket.key)}" data-stats-label="${escapeHtml(bucket.label)}">
        <div class="tag-list-header">
          <span class="tag-list-name">${escapeHtml(bucket.label)}</span>
          <span class="tag-list-cost">${mainValue}</span>
        </div>
        <div class="tag-progress-track">
          <div class="tag-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <div class="tag-list-sub">${subValue}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-stats-key]').forEach(item => {
    item.addEventListener('click', () => {
      applyStatsFilter(statsActiveView, item.dataset.statsKey, item.dataset.statsLabel);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Chart Rendering                                                     */
/* ------------------------------------------------------------------ */

async function renderChart() {
  const ctx = document.getElementById('costChart');
  if (!ctx) return;

  const buckets = getStatsBuckets();
  const chartTitle = document.getElementById('chartTitle');
  const chartBackBtn = document.getElementById('chartBackBtn');
  if (chartBackBtn) chartBackBtn.classList.add('hidden');
  if (chartTitle) chartTitle.innerText = statsViewMeta[statsActiveView]?.title || '统计分布';

  if (costChartInstance) costChartInstance.destroy();
  if (buckets.length === 0) {
    ctx.classList.add('hidden');
    return;
  }
  ctx.classList.remove('hidden');

  costChartInstance = new Chart(ctx, {
    type: statsActiveView === 'month' ? 'bar' : 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        data: buckets.map(b => Number(b.value.toFixed(2))),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)',
          'rgba(167, 139, 250, 0.8)', 'rgba(148, 163, 184, 0.8)'
        ],
        borderColor: 'rgba(15, 23, 42, 1)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const bucket = buckets[elements[0].index];
        applyStatsFilter(statsActiveView, bucket.key, bucket.label);
      },
      plugins: {
        legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (context) => {
              const suffix = statsActiveView === 'month' ? '' : ' / 天';
              return ` ${formatCurrency(context.parsed.y ?? context.parsed)}${suffix}`;
            }
          }
        }
      },
      scales: statsActiveView === 'month' ? {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
      } : undefined,
      cutout: statsActiveView === 'month' ? undefined : '70%'
    }
  });
}

async function renderTrendChart(range = currentTrendRange) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  currentTrendRange = range;

  document.querySelectorAll('.trend-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });

  const monthBuckets = getStatsBuckets('month').sort((a, b) => a.key.localeCompare(b.key));
  const labels = monthBuckets.map(b => b.label);
  const values = monthBuckets.map(b => Number(b.totalPrice.toFixed(2)));

  if (trendChartInstance) trendChartInstance.destroy();
  if (values.length === 0) {
    ctx.classList.add('hidden');
    return;
  }
  ctx.classList.remove('hidden');

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '月度投入（元）',
        data: values,
        borderColor: 'rgba(96, 165, 250, 1)',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(15, 23, 42, 1)',
        pointBorderColor: 'rgba(96, 165, 250, 1)',
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;
        const bucket = monthBuckets[elements[0].index];
        applyStatsFilter('month', bucket.key, bucket.label);
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => ` ${formatCurrency(context.parsed.y)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Record Operations                                                   */
/* ------------------------------------------------------------------ */

/**
 * Delete a record (move to trash) via ApiClient.
 * @param {number} id — Record ID
 */
function deleteRecord(id) {
  const record = globalRecords.find(r => r.id === id);
  if (!record) return;

  window.showAppConfirm(
    '移入回收站？',
    `确定要将「${record.item_name}」移入回收站吗？\n如果它还有子配件，请先解除绑定或移动子配件。`,
    async () => {
      try {
        await apiClient.delete(`/api/records/${id}`);
        if (window.toast) window.toast.success('已移入回收站');
        loadHistory();
        loadStats();
      } catch (err) {
        if (window.toast) window.toast.error(err.message || '删除失败');
        else window.showAppAlert(err.message || '删除失败');
      }
    },
    '确认删除'
  );
}

/**
 * Restore a record from trash via ApiClient.
 * @param {number} id — Record ID
 */
async function restoreRecord(id) {
  try {
    await apiClient.post(`/api/records/restore/${id}`);
    if (window.toast) window.toast.success('记录已恢复');
    loadTrash();
    loadHistory();
    loadStats();
  } catch (err) {
    if (window.toast) window.toast.error(err.message || '恢复失败');
    else window.showAppAlert(err.message || '恢复失败');
  }
}

/**
 * Permanently delete (purge) a record from trash via ApiClient.
 * @param {number} id — Record ID
 */
function purgeRecord(id) {
  window.showAppConfirm('永久删除？', '此操作无法撤销，记录会被永久移除。', async () => {
    try {
      await apiClient.delete(`/api/records/purge/${id}`);
      if (window.toast) window.toast.success('记录已永久删除');
      loadTrash();
    } catch (err) {
      if (window.toast) window.toast.error(err.message || '永久删除失败');
      else window.showAppAlert(err.message || '永久删除失败');
    }
  }, '永久删除');
}

/**
 * Toggle expand/collapse of child items for a parent record.
 * @param {number} parentId — Parent record ID
 */
function toggleChildren(parentId) {
  expandedParents[parentId] = !expandedParents[parentId];
  renderHistory();
}

/**
 * Open the status/edit modal for a record.
 * @param {number} id — Record ID
 */
function openStatusModal(id) {
  const record = globalRecords.find(r => r.id === id);
  if (!record || !statusModal) return;

  if (statusRecordId) statusRecordId.value = record.id;
  if (statusEditName) statusEditName.value = record.item_name;
  if (statusEditParentId) statusEditParentId.value = record.parent_id || '';
  if (statusEditPrice) statusEditPrice.value = record.price;
  if (statusEditDate) statusEditDate.value = record.purchase_date;

  const statusEditTags = document.getElementById('statusEditTags');
  if (statusEditTags) statusEditTags.value = record.tags || '';

  const statusEditDepMethod = document.getElementById('statusEditDepreciationMethod');
  if (statusEditDepMethod) statusEditDepMethod.value = record.depreciation_method || 'straight_line';

  const statusEditLifespan = document.getElementById('statusEditExpectedLifespan');
  if (statusEditLifespan) statusEditLifespan.value = record.expected_lifespan || 1095;

  const statusEditSalvage = document.getElementById('statusEditExpectedSalvage');
  if (statusEditSalvage) statusEditSalvage.value = record.expected_salvage || 0;

  // Prevent setting itself as parent
  if (statusEditParentId) {
    const options = statusEditParentId.options;
    for (let i = 0; i < options.length; i++) {
      options[i].disabled = (parseInt(options[i].value) === id);
    }
  }

  if (statusSelect) statusSelect.value = record.status || 'active';
  if (statusEndDate) {
    statusEndDate.value = record.end_date || todayStr;
    statusEndDate.max = todayStr;
  }
  if (statusResalePrice) statusResalePrice.value = record.resale_price || '';

  if (statusSelect) statusSelect.dispatchEvent(new Event('change'));
  statusModal.classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/*  Status Select Change Handler                                        */
/* ------------------------------------------------------------------ */

function handleStatusSelectChange() {
  if (!statusSelect) return;
  const val = statusSelect.value;
  if (endDateGroup) {
    if (val === 'active') endDateGroup.classList.add('hidden');
    else endDateGroup.classList.remove('hidden');
  }
  if (resalePriceGroup) {
    if (val === 'sold') resalePriceGroup.classList.remove('hidden');
    else resalePriceGroup.classList.add('hidden');
  }
}

/* ------------------------------------------------------------------ */
/*  Add Item Form                                                       */
/* ------------------------------------------------------------------ */

function handleInitialStatusChange() {
  if (!initialStatusSelect) return;
  const val = initialStatusSelect.value;
  if (formEndDateGroup) {
    if (val === 'active') formEndDateGroup.classList.add('hidden');
    else formEndDateGroup.classList.remove('hidden');
  }
  if (formResalePriceGroup) {
    if (val === 'sold') formResalePriceGroup.classList.remove('hidden');
    else formResalePriceGroup.classList.add('hidden');
  }
}

function handlePurchaseDateChange() {
  if (!purchaseDateInput || !formEndDate) return;
  formEndDate.min = purchaseDateInput.value;
  if (formEndDate.value && new Date(formEndDate.value) < new Date(purchaseDateInput.value)) {
    formEndDate.value = purchaseDateInput.value;
  }
}

async function handleCostFormSubmit(e) {
  e.preventDefault();

  const itemName = document.getElementById('itemName').value.trim() || '该物品';
  const price = parseFloat(document.getElementById('price').value);
  const purchaseDateStr = document.getElementById('purchaseDate').value;
  const parent_id = parentSelect ? (parentSelect.value || null) : null;
  const status = initialStatusSelect ? initialStatusSelect.value : 'active';
  const end_date = formEndDate ? (formEndDate.value || null) : null;
  const resale_price = parseFloat(document.getElementById('formResalePrice').value) || 0;
  const tags = document.getElementById('itemTags').value;
  const depreciation_method = document.getElementById('formDepreciationMethod').value;
  const expected_lifespan = parseInt(document.getElementById('formExpectedLifespan').value) || 1095;
  const expected_salvage = parseFloat(document.getElementById('formExpectedSalvage').value) || 0;

  // Validate end_date for non-active statuses
  if (status === 'broken' || status === 'sold') {
    if (!end_date) {
      if (formEndDate) {
        formEndDate.focus();
        formEndDate.style.borderColor = 'var(--danger)';
        setTimeout(() => formEndDate.style.borderColor = '', 2000);
      }
      return;
    }
    if (new Date(end_date) < new Date(purchaseDateStr)) {
      window.showAppAlert('终止日期不能早于购买日期！');
      if (formEndDate) {
        formEndDate.focus();
        formEndDate.style.borderColor = 'var(--danger)';
        setTimeout(() => formEndDate.style.borderColor = '', 2000);
      }
      return;
    }
  }

  if (!Number.isFinite(price) || price < 0) {
    window.showAppAlert('金额必须是大于等于 0 的数字');
    return;
  }
  if (resale_price < 0 || resale_price > price) {
    window.showAppAlert('回血金额必须在 0 到购买金额之间');
    return;
  }
  if (expected_lifespan < 1) {
    window.showAppAlert('预计寿命至少为 1 天');
    return;
  }
  if (expected_salvage < 0 || expected_salvage > price) {
    window.showAppAlert('终期残值必须在 0 到购买金额之间');
    return;
  }

  // Preview calculation
  const { dailyCost, actualDaysForCalc } = calculateCost({
    price, purchase_date: purchaseDateStr, status, end_date, resale_price
  });

  const submitBtn = costForm.querySelector('button[type="submit"]');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    await apiClient.post('/api/records', {
      item_name: itemName, price, purchase_date: purchaseDateStr, parent_id,
      status, end_date, resale_price, tags, depreciation_method,
      expected_lifespan, expected_salvage
    });

    costForm.reset();
    if (formEndDateGroup) formEndDateGroup.classList.add('hidden');
    if (formResalePriceGroup) formResalePriceGroup.classList.add('hidden');
    if (dateInput) {
      dateInput.max = todayStr;
      dateInput.value = todayStr;
    }
    if (addItemModal) addItemModal.classList.add('hidden');
    loadHistory();
    loadStats();

    if (window.toast) window.toast.success(`「${itemName}」已添加 · ¥${dailyCost.toFixed(2)}/天`);

    const modalResultTitle = document.getElementById('modalResultTitle');
    const modalDailyCost = document.getElementById('modalDailyCost');
    const modalDaysUsed = document.getElementById('modalDaysUsed');
    const modalTotalCost = document.getElementById('modalTotalCost');

    if (modalResultTitle) modalResultTitle.textContent = `${itemName} 的日均成本为`;
    if (resultModal) resultModal.classList.remove('hidden');
    if (modalDailyCost) animateValue(modalDailyCost, 0, dailyCost, 1000, true);
    if (modalDaysUsed) animateValue(modalDaysUsed, 0, actualDaysForCalc, 800, false);
    if (modalTotalCost) animateValue(modalTotalCost, 0, price, 800, true);
  } catch (err) {
    console.error('[RecordsView] 保存失败', err);
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Status/Edit Form Submit                                             */
/* ------------------------------------------------------------------ */

async function handleStatusFormSubmit(e) {
  e.preventDefault();
  if (!statusRecordId) return;

  const id = statusRecordId.value;
  const item_name = statusEditName ? (statusEditName.value.trim() || '物品') : '物品';
  const price = parseFloat(statusEditPrice?.value) || 0;
  const purchase_date = statusEditDate ? statusEditDate.value : '';
  const parent_id = statusEditParentId ? (statusEditParentId.value || null) : null;
  const status = statusSelect ? statusSelect.value : 'active';
  const end_date = statusEndDate ? statusEndDate.value : '';
  const resale_price = parseFloat(statusResalePrice?.value) || 0;
  const tags = document.getElementById('statusEditTags')?.value || '';
  const depreciation_method = document.getElementById('statusEditDepreciationMethod')?.value || 'straight_line';
  const expected_lifespan = parseInt(document.getElementById('statusEditExpectedLifespan')?.value) || 1095;
  const expected_salvage = parseFloat(document.getElementById('statusEditExpectedSalvage')?.value) || 0;

  if (!Number.isFinite(price) || price < 0) {
    window.showAppAlert('金额必须是大于等于 0 的数字');
    return;
  }
  if ((status === 'broken' || status === 'sold') && !end_date) {
    window.showAppAlert('已损坏或已回血的记录必须填写结束日期');
    return;
  }
  if (end_date && new Date(end_date) < new Date(purchase_date)) {
    window.showAppAlert('结束日期不能早于购买日期');
    return;
  }
  if (resale_price < 0 || resale_price > price) {
    window.showAppAlert('回血金额必须在 0 到购买金额之间');
    return;
  }
  if (expected_lifespan < 1) {
    window.showAppAlert('预计寿命至少为 1 天');
    return;
  }
  if (expected_salvage < 0 || expected_salvage > price) {
    window.showAppAlert('终期残值必须在 0 到购买金额之间');
    return;
  }

  const submitUpdate = async (cascadeAction = 'none') => {
    const submitBtn = statusForm.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    try {
      const data = await apiClient.put(`/api/records/${id}`, {
        item_name, price, purchase_date, status, end_date, resale_price,
        parent_id, tags, depreciation_method, expected_lifespan,
        expected_salvage, cascadeAction
      });
      if (statusModal) statusModal.classList.add('hidden');
      if (window.toast) window.toast.success('记录已更新');
      loadHistory();
      loadStats();
    } catch (err) {
      if (window.toast) window.toast.error(err.message || '更新失败');
      else window.showAppAlert(err.message || '更新失败');
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  };

  const record = globalRecords.find(r => r.id === parseInt(id));
  const children = globalRecords.filter(r => r.parent_id === parseInt(id));

  if (record && children.length > 0 && record.status === 'active' && (status === 'broken' || status === 'sold')) {
    const statusLabel = status === 'broken' ? '已损坏' : '已回血';
    window.showAppChoice(
      '级联处理',
      `该组合下包含 ${children.length} 个子配件。\n主体被标记为「${statusLabel}」后，您希望如何处理这些子配件？`,
      () => submitUpdate('bundle'),
      () => submitUpdate('orphan'),
      () => { /* cancel */ }
    );
  } else {
    submitUpdate('none');
  }
}

/* ------------------------------------------------------------------ */
/*  Export / Import Logic                                               */
/* ------------------------------------------------------------------ */

function handleExportCsv() {
  if (!globalRecords || globalRecords.length === 0) {
    window.showAppAlert('没有可导出的数据');
    return;
  }

  const headers = ['ID', '归属组合ID', '物品名称', '花费金额', '购买日期', '状态', '记录时间', '结束日期', '回血金额', '日均成本', '总天数', '最终折算金额'];
  const statusMap = { active: '使用中', broken: '已损坏', sold: '已回血' };
  const rows = globalRecords.map(r => [
    r.id, r.parent_id || '',
    `"${String(r.item_name || '').replace(/"/g, '""')}"`,
    r.price, r.purchase_date,
    statusMap[r.status] || '使用中',
    r.created_at, r.end_date || '',
    r.resale_price || 0,
    r._dailyCost?.toFixed(2) || '',
    r._days || '',
    r._finalCost?.toFixed(2) || ''
  ]);

  const csv = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
  downloadTextFile(csv, `DayCost_Export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
}

function handleBackupExport() {
  if (!globalRecords || globalRecords.length === 0) {
    window.showAppAlert('没有可导出的数据');
    return;
  }

  const cleanRecords = globalRecords.map(r => {
    const clean = { ...r };
    Object.keys(clean).forEach(key => {
      if (key.startsWith('_')) delete clean[key];
    });
    return clean;
  });

  downloadTextFile(
    JSON.stringify(cleanRecords, null, 2),
    `DayCost_Backup_${new Date().toISOString().split('T')[0]}.daycost`,
    'application/json;charset=utf-8'
  );
}

function handleBackupImport() {
  if (importFileInput) {
    importFileInput.value = '';
    importFileInput.click();
  }
}

async function executeCleanImport(mode) {
  if (importChoiceModal) importChoiceModal.classList.add('hidden');
  if (!tempDataToImport) return;

  try {
    await apiClient.post('/api/records/import', { mode, records: tempDataToImport });
    if (window.toast) window.toast.success('数据导入成功');
    loadHistory();
    loadStats();
  } catch (err) {
    if (window.toast) window.toast.error(err.message || '导入请求失败');
    else window.showAppAlert(err.message || '导入请求失败');
  } finally {
    tempDataToImport = null;
  }
}

function handleImportFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const json = JSON.parse(evt.target.result);
      if (!Array.isArray(json)) throw new Error('备份文件格式无效');
      tempDataToImport = json;
      if (importChoiceModal) importChoiceModal.classList.remove('hidden');
    } catch (err) {
      window.showAppAlert('解析备份文件失败：' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ */
/*  Public API — Get Records                                            */
/* ------------------------------------------------------------------ */

/**
 * Get the current global records array.
 * Used by BatchManager for select-all functionality.
 * @returns {Array<Object>}
 */
function getRecords() {
  return globalRecords;
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Initialize the records view module.
 * Binds all event listeners for filters, sorting, search, forms,
 * event delegation, stats views, export/import, and progressive disclosure.
 */
function initRecordsView() {
  // --- Initial date setup ---
  if (dateInput) {
    dateInput.max = todayStr;
    dateInput.value = todayStr;
  }

  // --- Status select change (edit modal) ---
  if (statusSelect) {
    statusSelect.addEventListener('change', handleStatusSelectChange);
  }

  // --- Initial status select change (add modal) ---
  if (initialStatusSelect) {
    initialStatusSelect.addEventListener('change', handleInitialStatusChange);
  }

  // --- Purchase date change (add modal) ---
  if (purchaseDateInput) {
    purchaseDateInput.addEventListener('change', handlePurchaseDateChange);
  }

  // --- Cost form submit (add item) ---
  if (costForm) {
    costForm.addEventListener('submit', handleCostFormSubmit);
  }

  // --- Status form submit (edit item) ---
  if (statusForm) {
    statusForm.addEventListener('submit', handleStatusFormSubmit);
  }

  // --- Infinite scroll ---
  if (historyListScroll) {
    historyListScroll.addEventListener('scroll', () => {
      if (!hasMoreRecords || isLoadingRecords) return;
      const { scrollTop, scrollHeight, clientHeight } = historyListScroll;
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        loadHistory(currentPage + 1, true);
      }
    });
  }

  // --- Filter/sort/search ---
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      statsLinkedFilter = null;
      updateStatsControls();
      currentPage = 1;
      loadHistory(1, false);
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentPage = 1;
      loadHistory(1, false);
    });
  }
  if (searchInput) {
    const debouncedSearch = debounce(() => {
      statsLinkedFilter = null;
      updateStatsControls();
      currentPage = 1;
      loadHistory(1, false);
    }, 300);
    searchInput.addEventListener('input', debouncedSearch);
  }

  // --- Event delegation for history list actions ---
  if (historyListScroll) {
    historyListScroll.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.toggle-children-btn');
      if (toggleBtn) {
        e.stopPropagation();
        const parentId = parseInt(toggleBtn.dataset.parentId, 10);
        if (!isNaN(parentId)) toggleChildren(parentId);
        return;
      }
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const recordId = parseInt(actionBtn.dataset.recordId, 10);
        const action = actionBtn.dataset.action;
        if (isNaN(recordId)) return;
        if (action === 'edit') openStatusModal(recordId);
        else if (action === 'delete') deleteRecord(recordId);
        else if (action === 'share') {
          const record = globalRecords.find(r => r.id === recordId);
          if (record) generateShareCard(record);
        }
        else if (action === 'restore') restoreRecord(recordId);
        else if (action === 'purge') purgeRecord(recordId);
      }
    });
  }

  // --- Event delegation for trash list ---
  if (trashListScroll) {
    trashListScroll.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      e.stopPropagation();
      const recordId = parseInt(actionBtn.dataset.recordId, 10);
      const action = actionBtn.dataset.action;
      if (isNaN(recordId)) return;
      if (action === 'restore') restoreRecord(recordId);
      else if (action === 'purge') purgeRecord(recordId);
    });
  }

  // --- Stats view tabs ---
  document.querySelectorAll('[data-stats-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      statsActiveView = btn.dataset.statsView || 'tag';
      updateStatsControls();
      renderStatsBreakdown();
      renderChart();
    });
  });

  const statsClearFilterBtn = document.getElementById('statsClearFilterBtn');
  if (statsClearFilterBtn) {
    statsClearFilterBtn.addEventListener('click', clearStatsFilter);
  }

  // --- Progressive disclosure: stats toggle ---
  const statsToggleBtn = document.getElementById('statsToggleDetails');
  const statsDetailSection = document.getElementById('statsDetailSection');
  if (statsToggleBtn && statsDetailSection) {
    let statsExpanded = false;
    statsToggleBtn.addEventListener('click', () => {
      statsExpanded = !statsExpanded;
      statsToggleBtn.classList.toggle('open', statsExpanded);
      statsToggleBtn.setAttribute('aria-expanded', String(statsExpanded));
      if (statsExpanded) {
        statsDetailSection.classList.remove('collapsed');
        statsDetailSection.classList.add('expanded');
        statsToggleBtn.innerHTML = '<span class="toggle-arrow">▲</span> 收起详细统计';
        requestAnimationFrame(() => {
          renderTrendChart(currentTrendRange);
          renderStatsBreakdown();
        });
      } else {
        statsDetailSection.classList.remove('expanded');
        statsDetailSection.classList.add('collapsed');
        statsToggleBtn.innerHTML = '<span class="toggle-arrow">▼</span> 展开详细统计';
      }
    });
  }

  // --- Export/Import buttons ---
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    const clone = exportCsvBtn.cloneNode(true);
    exportCsvBtn.replaceWith(clone);
    clone.addEventListener('click', handleExportCsv);
  }

  const backupExportBtn = document.getElementById('backupExportBtn');
  if (backupExportBtn) {
    const clone = backupExportBtn.cloneNode(true);
    backupExportBtn.replaceWith(clone);
    clone.addEventListener('click', handleBackupExport);
  }

  const backupImportBtn = document.getElementById('backupImportBtn');
  if (backupImportBtn) {
    const clone = backupImportBtn.cloneNode(true);
    backupImportBtn.replaceWith(clone);
    clone.addEventListener('click', handleBackupImport);
  }

  // --- Import file input ---
  const cleanImportFileInput = document.getElementById('importFileInput');
  if (cleanImportFileInput) {
    const clonedInput = cleanImportFileInput.cloneNode(true);
    cleanImportFileInput.replaceWith(clonedInput);
    clonedInput.addEventListener('change', handleImportFileChange);
  }

  // --- Import choice buttons ---
  const importCancelBtn = document.getElementById('importCancelBtn');
  if (importCancelBtn) {
    const clone = importCancelBtn.cloneNode(true);
    importCancelBtn.replaceWith(clone);
    clone.addEventListener('click', () => {
      if (importChoiceModal) importChoiceModal.classList.add('hidden');
      tempDataToImport = null;
    });
  }

  const importOverwriteBtn = document.getElementById('importOverwriteBtn');
  if (importOverwriteBtn) {
    const clone = importOverwriteBtn.cloneNode(true);
    importOverwriteBtn.replaceWith(clone);
    clone.addEventListener('click', () => executeCleanImport('overwrite'));
  }

  const importAppendBtn = document.getElementById('importAppendBtn');
  if (importAppendBtn) {
    const clone = importAppendBtn.cloneNode(true);
    importAppendBtn.replaceWith(clone);
    clone.addEventListener('click', () => executeCleanImport('append'));
  }

  // --- Chart back button ---
  const chartBackBtn = document.getElementById('chartBackBtn');
  if (chartBackBtn) {
    chartBackBtn.addEventListener('click', () => {
      if (globalRecords.length > 0) renderChart();
    });
  }

  // --- Offline detection ---
  const offlineBanner = document.getElementById('offlineBanner');
  function updateOnlineStatus() {
    if (!navigator.onLine) {
      if (offlineBanner) offlineBanner.classList.add('visible');
    } else {
      if (offlineBanner) offlineBanner.classList.remove('visible');
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // --- Listen for auth-success to load data ---
  document.addEventListener('daycost:auth-success', () => {
    loadHistory();
    loadStats();
  });

  // --- Listen for pane-switched to load trash ---
  document.addEventListener('daycost:pane-switched', (e) => {
    if (e.detail.paneId === 'pane-trash') {
      loadTrash();
    }
  });

  // --- Expose window globals for backward compatibility ---
  window.deleteRecord = deleteRecord;
  window.toggleChildren = toggleChildren;
  window.restoreRecord = restoreRecord;
  window.purgeRecord = purgeRecord;
  window.openStatusModal = openStatusModal;

  // Expose getHeaders via ApiClient for TOTP and other legacy modules
  window._apiClientGetHeaders = () => apiClient.getHeaders();
}

export {
  initRecordsView,
  loadHistory,
  loadStats,
  loadTrash,
  renderHistory,
  getRecords,
  calculateCost,
  escapeHtml,
  formatCurrency
};
