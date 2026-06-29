/**
 * ModalManager — Modal/dialog management for DayCost.
 * Handles all modal open/close logic, custom dialog systems (alert, confirm, choice),
 * and form-related modal bindings.
 *
 * Version: 1.0.0
 */

/* ------------------------------------------------------------------ */
/*  DOM Element References                                              */
/* ------------------------------------------------------------------ */

// Result modal (cost calculation result)
const resultModal = document.getElementById('resultModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');

// Status/Edit modal
const statusModal = document.getElementById('statusModal');
const statusModalCloseBtn = document.getElementById('statusModalCloseBtn');

// Password modal
const passwordModal = document.getElementById('passwordModal');
const passwordModalCloseBtn = document.getElementById('passwordModalCloseBtn');

// AddItem modal
const addItemModal = document.getElementById('addItemModal');
const addItemModalClose = document.getElementById('addItemModalClose');

// Depreciation info modal
const depreciationInfoModal = document.getElementById('depreciationInfoModal');
const depreciationInfoModalClose = document.getElementById('depreciationInfoModalClose');
const depreciationInfoOkBtn = document.getElementById('depreciationInfoOkBtn');
const depreciationInfoBtn1 = document.getElementById('depreciationInfoBtn1');
const depreciationInfoBtn2 = document.getElementById('depreciationInfoBtn2');

// Custom alert modal
const customAlertModal = document.getElementById('customAlertModal');
const alertIcon = document.getElementById('alertIcon');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const alertOkBtn = document.getElementById('alertOkBtn');

// Custom confirm modal
const customConfirmModal = document.getElementById('customConfirmModal');

// Custom choice modal
const customChoiceModal = document.getElementById('customChoiceModal');

// Import choice modal
const importChoiceModal = document.getElementById('importChoiceModal');
const importFileInput = document.getElementById('importFileInput');

// Global tooltip
const tooltip = document.getElementById('globalTooltip');

// FAB button
const fabAddBtn = document.getElementById('fabAddBtn');

/* ------------------------------------------------------------------ */
/*  Tooltip System                                                      */
/* ------------------------------------------------------------------ */

/**
 * Bind a tooltip to an element, showing text on hover when content is truncated.
 * @param {HTMLElement} el — Target element
 * @param {string} text — Tooltip text to display
 */
function bindTooltip(el, text) {
  el.addEventListener('mouseenter', (e) => {
    if (el.scrollWidth <= el.clientWidth) return;
    tooltip.textContent = text;
    tooltip.classList.add('show');
    positionTooltip(e);
  });
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', () => {
    tooltip.classList.remove('show');
  });
}

/**
 * Position the tooltip near the mouse cursor, avoiding viewport overflow.
 * @param {MouseEvent} e
 */
function positionTooltip(e) {
  if (!tooltip) return;
  const pad = 14;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tw > window.innerWidth) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight) y = e.clientY - th - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

/* ------------------------------------------------------------------ */
/*  Custom Dialog Systems                                               */
/* ------------------------------------------------------------------ */

/**
 * Show an application-level alert dialog.
 * Replaces the old window.showAppAlert global.
 * @param {string} msg — Alert message
 * @param {string} [type='error'] — Alert type: 'error' or 'success'
 */
function showAppAlert(msg, type = 'error') {
  if (!customAlertModal) return;
  alertMessage.innerText = msg;
  if (type === 'success') {
    alertIcon.innerText = '✅';
    alertTitle.innerText = '成功';
    alertTitle.style.color = '#10b981';
  } else {
    alertIcon.innerText = '❌';
    alertTitle.innerText = '错误提示';
    alertTitle.style.color = '#ef4444';
  }
  customAlertModal.classList.remove('hidden');
}

/**
 * Show a confirmation dialog with OK/Cancel buttons.
 * Replaces the old window.showAppConfirm global.
 * @param {string} title — Dialog title
 * @param {string} msg — Confirmation message
 * @param {Function} onOk — Callback when user confirms
 * @param {string} [okLabel='确认'] — Label for the OK button
 */
function showAppConfirm(title, msg, onOk, okLabel = '确认') {
  if (!customConfirmModal) return;
  document.getElementById('confirmTitle').innerText = title;
  document.getElementById('confirmMessage').innerText = msg;

  const okBtn = document.getElementById('confirmOkBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  okBtn.innerText = okLabel;

  // Clone buttons to remove old event listeners
  const newOk = okBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  okBtn.replaceWith(newOk);
  cancelBtn.replaceWith(newCancel);

  newCancel.addEventListener('click', () => customConfirmModal.classList.add('hidden'));
  newOk.addEventListener('click', () => {
    customConfirmModal.classList.add('hidden');
    onOk();
  });
  customConfirmModal.classList.remove('hidden');
}

/**
 * Show a choice dialog with three options (bundle, orphan, cancel).
 * Replaces the old window.showAppChoice global.
 * @param {string} title — Dialog title
 * @param {string} msg — Choice message
 * @param {Function} onBundle — Callback for "sync children" option
 * @param {Function} onOrphan — Callback for "only parent, detach children" option
 * @param {Function} [onCancel] — Callback for cancel option
 */
function showAppChoice(title, msg, onBundle, onOrphan, onCancel) {
  if (!customChoiceModal) return;
  document.getElementById('choiceTitle').innerText = title;
  document.getElementById('choiceMessage').innerText = msg;

  const bundleBtn = document.getElementById('choiceBundleBtn');
  const orphanBtn = document.getElementById('choiceOrphanBtn');
  const cancelBtn = document.getElementById('choiceCancelBtn');

  const newBundle = bundleBtn.cloneNode(true);
  const newOrphan = orphanBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  bundleBtn.replaceWith(newBundle);
  orphanBtn.replaceWith(newOrphan);
  cancelBtn.replaceWith(newCancel);

  newCancel.addEventListener('click', () => {
    customChoiceModal.classList.add('hidden');
    if (onCancel) onCancel();
  });
  newBundle.addEventListener('click', () => {
    customChoiceModal.classList.add('hidden');
    onBundle();
  });
  newOrphan.addEventListener('click', () => {
    customChoiceModal.classList.add('hidden');
    onOrphan();
  });

  customChoiceModal.classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/*  Modal Open/Close Functions                                          */
/* ------------------------------------------------------------------ */

/**
 * Open a modal by type with optional data.
 * @param {string} type — Modal type: 'addItem', 'result', 'depreciationInfo', 'password', 'importChoice'
 * @param {Object} [data] — Optional data to populate the modal
 */
function openModal(type, data = {}) {
  switch (type) {
    case 'addItem':
      if (addItemModal) addItemModal.classList.remove('hidden');
      break;
    case 'result':
      if (resultModal) resultModal.classList.remove('hidden');
      break;
    case 'depreciationInfo':
      if (depreciationInfoModal) depreciationInfoModal.classList.remove('hidden');
      break;
    case 'password':
      if (passwordModal) {
        passwordModal.classList.remove('hidden');
      }
      break;
    case 'importChoice':
      if (importChoiceModal) importChoiceModal.classList.remove('hidden');
      break;
    default:
      console.warn('[ModalManager] Unknown modal type:', type);
  }
}

/**
 * Close the currently open modal (generic close).
 * For specific modals, use the close functions below.
 */
function closeModal() {
  // Close all visible modals
  const modals = [
    resultModal, statusModal, passwordModal, addItemModal,
    depreciationInfoModal, customAlertModal, customConfirmModal,
    customChoiceModal, importChoiceModal
  ];
  modals.forEach(m => {
    if (m) m.classList.add('hidden');
  });
}

/* ------------------------------------------------------------------ */
/*  Depreciation Info Modal                                             */
/* ------------------------------------------------------------------ */

/**
 * Open the depreciation algorithm info modal.
 * Exposed as window function for backward compatibility.
 */
function openDepreciationInfoModal() {
  if (depreciationInfoModal) {
    depreciationInfoModal.classList.remove('hidden');
  }
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Initialize the modal manager.
 * Binds all modal close events, custom dialog button events,
 * FAB button, depreciation info buttons, and exposes window globals.
 */
function initModals() {
  // --- Result modal close ---
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
  }
  if (resultModal) {
    resultModal.addEventListener('click', (e) => {
      if (e.target === resultModal) resultModal.classList.add('hidden');
    });
  }

  // --- Status modal close ---
  if (statusModalCloseBtn) {
    statusModalCloseBtn.addEventListener('click', () => statusModal.classList.add('hidden'));
  }
  if (statusModal) {
    statusModal.addEventListener('click', (e) => {
      if (e.target === statusModal) statusModal.classList.add('hidden');
    });
  }

  // --- Password modal close ---
  if (passwordModalCloseBtn) {
    passwordModalCloseBtn.addEventListener('click', () => passwordModal.classList.add('hidden'));
  }
  if (passwordModal) {
    passwordModal.addEventListener('click', (e) => {
      if (e.target === passwordModal) passwordModal.classList.add('hidden');
    });
  }

  // --- AddItem modal close ---
  if (addItemModalClose && addItemModal) {
    addItemModalClose.addEventListener('click', () => addItemModal.classList.add('hidden'));
  }

  // --- Depreciation info modal ---
  if (depreciationInfoModalClose && depreciationInfoModal) {
    depreciationInfoModalClose.addEventListener('click', () => depreciationInfoModal.classList.add('hidden'));
  }
  if (depreciationInfoOkBtn && depreciationInfoModal) {
    depreciationInfoOkBtn.addEventListener('click', () => depreciationInfoModal.classList.add('hidden'));
  }
  if (depreciationInfoBtn1 && depreciationInfoModal) {
    depreciationInfoBtn1.addEventListener('click', () => depreciationInfoModal.classList.remove('hidden'));
  }
  if (depreciationInfoBtn2 && depreciationInfoModal) {
    depreciationInfoBtn2.addEventListener('click', () => depreciationInfoModal.classList.remove('hidden'));
  }

  // --- Custom alert OK button ---
  if (alertOkBtn) {
    alertOkBtn.addEventListener('click', () => {
      if (customAlertModal) customAlertModal.classList.add('hidden');
    });
  }

  // --- Advanced toggles (progressive disclosure in forms) ---
  const editAdvancedToggle = document.getElementById('editAdvancedToggle');
  const editAdvancedContent = document.getElementById('editAdvancedContent');
  if (editAdvancedToggle && editAdvancedContent) {
    editAdvancedToggle.addEventListener('click', () => {
      editAdvancedContent.classList.toggle('hidden');
      editAdvancedToggle.classList.toggle('open');
    });
  }

  const addAdvancedToggle = document.getElementById('addAdvancedToggle');
  const addAdvancedContent = document.getElementById('addAdvancedContent');
  if (addAdvancedToggle && addAdvancedContent) {
    addAdvancedToggle.addEventListener('click', () => {
      addAdvancedContent.classList.toggle('hidden');
      addAdvancedToggle.classList.toggle('open');
    });
  }

  // --- FAB button: click opens QuickAddPanel; long-press opens full modal ---
  let fabLongPressTimer = null;
  if (fabAddBtn) {
    fabAddBtn.addEventListener('click', () => {
      if (window._quickAddPanel) window._quickAddPanel.toggle();
      else if (addItemModal) addItemModal.classList.remove('hidden');
    });
    fabAddBtn.addEventListener('pointerdown', () => {
      fabLongPressTimer = setTimeout(() => {
        fabLongPressTimer = null;
        if (addItemModal) addItemModal.classList.remove('hidden');
      }, 600);
    });
    fabAddBtn.addEventListener('pointerup', () => {
      if (fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null; }
    });
    fabAddBtn.addEventListener('pointerleave', () => {
      if (fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null; }
    });
  }

  // --- Expose window globals for backward compatibility ---
  window.showAppAlert = showAppAlert;
  window.showAppConfirm = showAppConfirm;
  window.showAppChoice = showAppChoice;
  window.openDepreciationInfoModal = openDepreciationInfoModal;
  window.highlightInvalidField = function (inputEl, message) {
    inputEl.classList.add('input-error');
    inputEl.focus();
    if (window.toast) window.toast.warning(message || '请检查输入内容');
    const clearHighlight = () => {
      inputEl.classList.remove('input-error');
      inputEl.removeEventListener('input', clearHighlight);
      inputEl.removeEventListener('change', clearHighlight);
    };
    inputEl.addEventListener('input', clearHighlight);
    inputEl.addEventListener('change', clearHighlight);
  };
}

export {
  initModals,
  openModal,
  closeModal,
  showAppAlert,
  showAppConfirm,
  showAppChoice,
  bindTooltip,
  positionTooltip
};
