/**
 * app.js — ES Module entry point for DayCost frontend.
 * Orchestrates initialization of all modules and sets up cross-module integrations.
 *
 * This replaces script.js as the main controller. The old script.js is preserved
 * as a fallback but no longer referenced in index.html.
 *
 * Version: 1.0.0
 */

import apiClient from './api-client.js';
import { initAuthView, checkAuth } from './auth-view.js';
import { initNavigation } from './nav-controller.js';
import { initModals } from './modal-manager.js';
import { initRecordsView, loadHistory, loadStats, getRecords, calculateCost } from './records-view.js';
import { initOnboarding } from './onboarding.js';
import { initRankingView } from './ranking-view.js';
import { initShareCard } from './share-card.js';

/* ------------------------------------------------------------------ */
/*  Cross-Module Integrations                                          */
/* ------------------------------------------------------------------ */

/**
 * QuickAddPanel integration.
 * Creates a QuickAddPanel instance and wires it to record creation via ApiClient.
 */
function setupQuickAddPanel() {
  if (!window.QuickAddPanel) return;

  window._quickAddPanel = new window.QuickAddPanel({
    onSubmit: async (payload) => {
      try {
        const data = await apiClient.post('/api/records', payload);

        loadHistory();
        loadStats();

        const { dailyCost } = calculateCost(data);
        if (window.toast) window.toast.success(`「${payload.item_name}」已添加 · ¥${(dailyCost || 0).toFixed(2)}/天`);
      } catch (err) {
        if (window.toast) window.toast.error(err.message || '添加失败');
        throw err;
      }
    },
  });
}

/**
 * BatchManager integration.
 * Creates a BatchManager instance with batch status change and delete operations via ApiClient.
 */
function setupBatchManager() {
  if (!window.BatchManager) return null;

  const batchMgr = new window.BatchManager({
    onBatchStatusChange: async (ids, status) => {
      const results = await Promise.allSettled(
        ids.map(id =>
          apiClient.put(`/api/records/${id}`, { status, cascadeAction: 'none' })
            .then(data => data)
            .catch(err => Promise.reject(err))
        )
      );
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`${failed.length} 项更新失败`);
      }
      loadHistory();
      loadStats();
    },
    onBatchDelete: async (ids) => {
      const results = await Promise.allSettled(
        ids.map(id =>
          apiClient.delete(`/api/records/${id}`)
            .then(data => data)
            .catch(err => Promise.reject(err))
        )
      );
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`${failed.length} 项删除失败`);
      }
      loadHistory();
      loadStats();
    },
    getRecords: () => getRecords(),
    onCancel: () => { /* batch mode deactivated */ },
  });

  return batchMgr;
}

/**
 * InlineEditor + long-press/double-click integration on record cards.
 * @param {BatchManager|null} batchMgr — BatchManager instance for long-press activation
 */
function setupCardInteractions(batchMgr) {
  const historyScrollEl = document.getElementById('historyListScroll');
  if (!historyScrollEl) return;

  let longPressTimer = null;
  let longPressTarget = null;
  const LONG_PRESS_MS = 500;

  function getRecordFromCard(el) {
    const card = el.closest('.history-item');
    if (!card) return null;
    const id = parseInt(card.dataset.id, 10);
    if (isNaN(id)) return null;
    return { id, card };
  }

  // Pointer down for long-press detection
  historyScrollEl.addEventListener('pointerdown', (e) => {
    const info = getRecordFromCard(e.target);
    if (!info) return;
    if (e.target.closest('[data-action]') || e.target.closest('.toggle-children-btn') || e.target.closest('.swipe-actions')) return;

    longPressTarget = info;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (batchMgr) {
        if (!batchMgr.isActive) {
          batchMgr.activate(info.id);
          info.card.classList.add('batch-selected');
        }
      }
    }, LONG_PRESS_MS);
  });

  historyScrollEl.addEventListener('pointerup', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });

  historyScrollEl.addEventListener('pointermove', () => {
    // Long-press continues unless finger is lifted
  });

  historyScrollEl.addEventListener('pointercancel', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  });

  // Double-click → inline edit (desktop)
  historyScrollEl.addEventListener('dblclick', (e) => {
    const info = getRecordFromCard(e.target);
    if (!info) return;
    if (e.target.closest('[data-action]') || e.target.closest('.toggle-children-btn') || e.target.closest('.swipe-actions')) return;
    if (batchMgr && batchMgr.isActive) return;

    const records = getRecords();
    const record = records.find(r => r.id === info.id);
    if (!record) return;

    if (info.card.closest('.record-wrapper.inline-editing')) return;

    const editor = new window.InlineEditor({
      recordId: info.id,
      record: record,
      cardElement: info.card,
      onSave: async (recordId, updates) => {
        try {
          await apiClient.put(`/api/records/${recordId}`, { ...updates, cascadeAction: 'none' });
          if (window.toast) window.toast.success('记录已更新');
          loadHistory();
          loadStats();
        } catch (err) {
          if (window.toast) window.toast.error(err.message || '更新失败');
          throw err;
        }
      },
    });
    editor.enterEditMode();
  });

  // Click in batch mode → toggle selection
  historyScrollEl.addEventListener('click', (e) => {
    if (!batchMgr || !batchMgr.isActive) return;
    const info = getRecordFromCard(e.target);
    if (!info) return;
    if (e.target.closest('[data-action]') || e.target.closest('.toggle-children-btn')) return;

    e.stopPropagation();
    batchMgr.toggle(info.id, info.card);
  });

  // Mobile swipe integration
  if (window.DayCostSwipe) window.DayCostSwipe.init(historyScrollEl);
}

/**
 * TOTP module integration.
 * Passes ApiClient's getHeaders and escapeHtml to the TOTP module.
 */
function setupTOTP() {
  if (window.DayCostTotp) {
    window.DayCostTotp.init({
      getHeaders: () => apiClient.getHeaders(),
      escapeHtml: (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Global Fetch Error Handler                                          */
/* ------------------------------------------------------------------ */

/**
 * Wrap window.fetch to:
 * 1. Inject CSRF token for mutating requests from non-module scripts (settings.js, totp.js)
 *    that don't use ApiClient. ApiClient already handles CSRF internally, so we skip
 *    requests that already have the X-CSRF-Token header.
 * 2. Show toast notifications for network errors.
 */
function setupGlobalFetchErrorHandler() {
  const origFetch = window.fetch;
  const offlineBanner = document.getElementById('offlineBanner');
  const CSRF_HEADER = 'X-CSRF-Token';
  const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

  window.fetch = async function (...args) {
    let [url, options = {}] = args;
    const method = (options.method || 'GET').toUpperCase();

    // Inject CSRF token for mutating requests from raw fetch calls
    // (non-module scripts like settings.js don't use ApiClient)
    if (MUTATING_METHODS.includes(method)) {
      const csrfToken = localStorage.getItem('daycost_csrf_token');
      if (csrfToken) {
        // Ensure headers object exists
        if (!options.headers) {
          options.headers = {};
        }

        // Handle Headers instance vs plain object
        if (options.headers instanceof Headers) {
          if (!options.headers.has(CSRF_HEADER)) {
            options.headers.set(CSRF_HEADER, csrfToken);
          }
        } else if (typeof options.headers === 'object') {
          // Check if CSRF header already present (ApiClient requests have it)
          const hasCsrf = Object.keys(options.headers).some(
            key => key.toLowerCase() === CSRF_HEADER.toLowerCase()
          );
          if (!hasCsrf) {
            options.headers[CSRF_HEADER] = csrfToken;
          }
        }

        // Update args with modified options
        args = [url, options];
      }
    }

    try {
      const response = await origFetch.apply(this, args);
      return response;
    } catch (err) {
      if (!navigator.onLine) {
        if (offlineBanner) offlineBanner.classList.add('visible');
        if (window.toast) window.toast.error('网络连接已断开，请检查网络后重试');
      } else if (err.message && err.message.includes('Failed to fetch')) {
        if (window.toast) window.toast.error('服务器连接失败，请稍后重试');
      }
      throw err;
    }
  };
}

/* ------------------------------------------------------------------ */
/*  App Initialization                                                  */
/* ------------------------------------------------------------------ */

async function initApp() {
  // 1. Global fetch error handler
  setupGlobalFetchErrorHandler();

  // 2. CSRF token refresh
  try {
    await apiClient.refreshCsrfToken();
  } catch (e) {
    console.error('[App] CSRF token refresh failed:', e.message);
  }

  // 3. Init auth view
  try {
    initAuthView();
  } catch (e) {
    console.error('[App] Auth view init failed:', e.message);
  }

  // 4. Init navigation
  try {
    initNavigation();
  } catch (e) {
    console.error('[App] Navigation init failed:', e.message);
  }

  // 5. Init modals
  try {
    initModals();
  } catch (e) {
    console.error('[App] Modals init failed:', e.message);
  }

  // 6. Init records view
  try {
    initRecordsView();
  } catch (e) {
    console.error('[App] Records view init failed:', e.message);
  }

  // 7. Init ranking view
  try {
    initRankingView();
  } catch (e) {
    console.error('[App] Ranking view init failed:', e.message);
  }

  // 8. Init share card
  try {
    initShareCard();
  } catch (e) {
    console.error('[App] Share card init failed:', e.message);
  }

  // 9. QuickAddPanel (classic script global)
  try {
    setupQuickAddPanel();
  } catch (e) {
    console.error('[App] QuickAddPanel setup failed:', e.message);
  }

  // 10. BatchManager (classic script global)
  let batchMgr;
  try {
    batchMgr = setupBatchManager();
  } catch (e) {
    console.error('[App] BatchManager setup failed:', e.message);
    batchMgr = null;
  }

  // 11. Card interactions
  try {
    setupCardInteractions(batchMgr);
  } catch (e) {
    console.error('[App] Card interactions setup failed:', e.message);
  }

  // 12. TOTP (classic script global)
  try {
    setupTOTP();
  } catch (e) {
    console.error('[App] TOTP setup failed:', e.message);
  }

  // 13. Onboarding listener
  document.addEventListener('daycost:auth-success', () => {
    setTimeout(() => {
      initOnboarding().catch(err => console.error('[App] Onboarding init failed:', err.message));
    }, 1500);
  });

  // 14. Check auth
  try {
    checkAuth();
  } catch (e) {
    console.error('[App] Auth check failed:', e.message);
  }
}

// Execute initialization
// Module scripts are deferred, so DOM is fully parsed when this runs.
initApp().catch(err => {
  console.error('[App] Initialization failed:', err);
});
