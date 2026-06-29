/**
 * NavController — Navigation controller for DayCost SPA.
 * Handles tab switching, pane visibility, "更多" dropdown menu,
 * settings button, and nav indicator animation.
 *
 * Version: 1.0.0
 */

/* ------------------------------------------------------------------ */
/*  DOM Element References                                              */
/* ------------------------------------------------------------------ */

const navBtns = document.querySelectorAll('.nav-btn[data-target]');
const navMoreItems = document.querySelectorAll('.nav-more-item[data-target]');
const navSettingsBtn = document.getElementById('navSettingsBtn');
const navMoreBtn = document.getElementById('navMoreBtn');
const navMoreDropdown = document.getElementById('navMoreDropdown');
const panes = document.querySelectorAll('.spa-pane');
const navIndicator = document.querySelector('.nav-indicator');

/** Set of pane IDs that live under the "更多" menu */
const morePaneIds = new Set(
  Array.from(navMoreItems).map(el => el.getAttribute('data-target'))
);

/* ------------------------------------------------------------------ */
/*  Navigation Indicator Animation                                      */
/* ------------------------------------------------------------------ */

/**
 * Move the nav indicator bar to align with the active button.
 * @param {HTMLElement|null} activeBtn — The currently active nav button
 */
function moveIndicator(activeBtn) {
  if (!navIndicator || !activeBtn) return;
  const group = activeBtn.parentElement;
  const groupRect = group.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  navIndicator.style.left = (btnRect.left - groupRect.left) + 'px';
  navIndicator.style.width = btnRect.width + 'px';
}

/* ------------------------------------------------------------------ */
/*  Pane Switching                                                      */
/* ------------------------------------------------------------------ */

/**
 * Switch to a specific SPA pane by ID.
 * Updates pane visibility, nav button active states, "更多" and settings highlights.
 * Dispatches 'daycost:pane-switched' event with the target pane ID.
 *
 * @param {string} targetId — The pane ID to switch to (e.g., 'pane-home', 'pane-stats')
 */
function switchView(targetId) {
  // Show/hide panes
  panes.forEach(pane => {
    if (pane.id === targetId) {
      pane.classList.remove('hidden');
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
      pane.classList.add('hidden');
    }
  });

  const isMorePane = morePaneIds.has(targetId);
  const isSettings = targetId === 'pane-settings';

  // Update main nav button active states
  navBtns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  if (!isMorePane && !isSettings) {
    const matchBtn = Array.from(navBtns).find(
      b => b.getAttribute('data-target') === targetId
    );
    if (matchBtn) {
      matchBtn.classList.add('active');
      matchBtn.setAttribute('aria-selected', 'true');
      moveIndicator(matchBtn);
    }
  }

  // "更多" button highlight
  if (navMoreBtn) {
    navMoreBtn.classList.toggle('active', isMorePane);
  }

  // Settings button highlight
  if (navSettingsBtn) {
    navSettingsBtn.classList.toggle('active', isSettings);
  }

  // Close the dropdown
  closeMoreMenu();

  // Dispatch pane-switched event for other modules
  document.dispatchEvent(new CustomEvent('daycost:pane-switched', {
    detail: { paneId: targetId }
  }));
}

/* ------------------------------------------------------------------ */
/*  "更多" Dropdown Menu                                                */
/* ------------------------------------------------------------------ */

/**
 * Close the "更多" dropdown menu.
 */
function closeMoreMenu() {
  if (navMoreDropdown) navMoreDropdown.classList.remove('open');
  if (navMoreBtn) {
    navMoreBtn.classList.remove('open');
    navMoreBtn.setAttribute('aria-expanded', 'false');
  }
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Initialize the navigation controller.
 * Binds click events on nav buttons, "更多" menu items, settings button,
 * and the dropdown toggle. Sets initial indicator position.
 */
function initNavigation() {
  // Initialize indicator position
  const initialActive = document.querySelector('.nav-btn.active');
  if (initialActive) {
    requestAnimationFrame(() => moveIndicator(initialActive));
  }

  // Main nav buttons
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.getAttribute('data-target'));
    });
  });

  // "更多" menu items
  navMoreItems.forEach(item => {
    item.addEventListener('click', () => {
      switchView(item.getAttribute('data-target'));
      navMoreItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Settings button
  if (navSettingsBtn) {
    navSettingsBtn.addEventListener('click', () => {
      switchView(navSettingsBtn.getAttribute('data-target'));
    });
  }

  // "更多" dropdown toggle
  if (navMoreBtn && navMoreDropdown) {
    navMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navMoreDropdown.classList.toggle('open');
      navMoreBtn.classList.toggle('open', isOpen);
      navMoreBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!navMoreDropdown.contains(e.target) && e.target !== navMoreBtn) {
        closeMoreMenu();
      }
    });
  }

  // Handle pane-switched events for pane-specific hooks
  document.addEventListener('daycost:pane-switched', (e) => {
    const { paneId } = e.detail;
    // TOTP pane: load groups and codes
    if (paneId === 'pane-totp' && window.DayCostTotp) {
      // TOTP module handles its own loading via nav-btn listener
    }
  });
}

export { initNavigation, switchView, moveIndicator };
