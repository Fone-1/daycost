/**
 * Onboarding — 3-step new user guide for DayCost.
 * Step 1: Explain daily cost concept ("买得起不一定用得起")
 * Step 2: Guide to add first item (highlight the add button)
 * Step 3: Guide to explore stats view (highlight the stats tab)
 *
 * State persistence: localStorage 'daycost_onboarding_done'
 *
 * Version: 1.1.0
 */

import apiClient from './api-client.js';

const ONBOARDING_KEY = 'daycost_onboarding_done';

/** @type {number} Current step index (0-based) */
let currentStep = 0;

/** @type {boolean} Whether onboarding is currently active */
let isActive = false;

/** @type {HTMLElement|null} Overlay root element */
let overlayEl = null;

/** @type {HTMLElement|null} Highlight box element */
let highlightEl = null;

/** @type {HTMLElement|null} Step card element */
let cardEl = null;

/** @type {HTMLElement|null} Step indicator element */
let indicatorEl = null;

/** @type {Function|null} Cleanup function for window resize listener */
let resizeCleanup = null;

/**
 * Onboarding step definitions.
 * @type {Array<Object>}
 */
const steps = [
  {
    title: '什么是日摊成本？',
    description: '"买得起不一定用得起"——一件 9999 元的手机用了 1000 天，日均成本才 ¥9.99。DayCost 帮你看清每一笔投入的真实日均价值。',
    icon: 'concept',
    ctaText: '知道了，开始记录',
    targetSelector: null,
    cardPosition: 'center'
  },
  {
    title: '添加你的第一件物品',
    description: '点击高亮的 + 按钮，输入物品名称和买入价格，系统会自动计算日摊成本。添加完成后点击「下一步」继续。',
    icon: 'add',
    ctaText: '我已添加，下一步',
    targetSelector: '#fabAddBtn',
    cardPosition: 'left'
  },
  {
    title: '探索统计分析',
    description: '切换到「统计」标签，查看成本排行、标签分布和投入趋势，全面掌握你的资产状况。',
    icon: 'stats',
    ctaText: '完成引导',
    targetSelector: '[data-target="pane-stats"]',
    cardPosition: 'bottom'
  }
];

/* ------------------------------------------------------------------ */
/*  SVG Illustrations                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get SVG illustration for a given step icon type.
 * @param {string} iconType — 'concept' | 'add' | 'stats'
 * @param {string} color — Stroke color
 * @returns {string} SVG HTML string
 */
function getIllustration(iconType, color = 'var(--color-brand-primary, #f59e0b)') {
  const illustrations = {
    concept: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="20" width="60" height="45" rx="6"/>
      <line x1="10" y1="35" x2="70" y2="35"/>
      <circle cx="20" cy="27" r="2" fill="${color}"/>
      <line x1="25" y1="27" x2="55" y2="27"/>
      <text x="25" y="52" font-size="11" fill="${color}" stroke="none" font-family="monospace">¥9.99</text>
      <text x="25" y="62" font-size="8" fill="${color}" stroke="none" opacity="0.6">/天</text>
      <path d="M55 50 L65 50 M60 45 L60 55" stroke-width="1.5"/>
    </svg>`,
    add: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="15" y="15" width="50" height="50" rx="10" stroke-dasharray="5 5"/>
      <line x1="40" y1="28" x2="40" y2="52"/>
      <line x1="28" y1="40" x2="52" y2="40"/>
      <circle cx="60" cy="60" r="14" fill="${color}" stroke="none" opacity="0.15"/>
      <line x1="60" y1="54" x2="60" y2="66" stroke-width="2.5"/>
      <line x1="54" y1="60" x2="66" y2="60" stroke-width="2.5"/>
    </svg>`,
    stats: `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="15" width="60" height="55" rx="6"/>
      <line x1="10" y1="30" x2="70" y2="30"/>
      <rect x="20" y="45" width="8" height="18" rx="2" fill="${color}" stroke="none" opacity="0.3"/>
      <rect x="34" y="38" width="8" height="25" rx="2" fill="${color}" stroke="none" opacity="0.5"/>
      <rect x="48" y="42" width="8" height="21" rx="2" fill="${color}" stroke="none" opacity="0.7"/>
      <rect x="60" y="35" width="6" height="28" rx="2" fill="${color}" stroke="none"/>
      <line x1="18" y1="55" x2="68" y2="55" stroke-dasharray="2 3" opacity="0.4"/>
    </svg>`
  };
  return illustrations[iconType] || illustrations.concept;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Check if onboarding has been completed.
 * @returns {boolean}
 */
function checkOnboardingStatus() {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

/**
 * Check if the user has any records. Used to determine if onboarding should start.
 * @returns {Promise<boolean>} True if user has at least one record
 */
async function hasUserRecords() {
  try {
    const result = await apiClient.get('/api/records?page=1&limit=1');
    return (result.data && result.data.length > 0);
  } catch (e) {
    return false;
  }
}

/**
 * Initialize onboarding. Called after auth success.
 * If onboarding is already done or user has records, skip.
 * @returns {Promise<void>}
 */
async function initOnboarding() {
  if (checkOnboardingStatus()) return;
  if (isActive) return;

  // If user already has records, mark onboarding as done
  const hasRecords = await hasUserRecords();
  if (hasRecords) {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    return;
  }

  // Start onboarding
  start();
}

/**
 * Start the onboarding flow.
 */
function start() {
  if (isActive) return;
  isActive = true;
  currentStep = 0;
  createOverlay();
  renderStep(currentStep);
}

/**
 * Create the onboarding overlay DOM structure.
 */
function createOverlay() {
  // Remove any existing overlay
  destroyOverlay();

  overlayEl = document.createElement('div');
  overlayEl.id = 'onboarding-overlay';
  overlayEl.className = 'onboarding-overlay';

  // Highlight box (positioned over target element)
  highlightEl = document.createElement('div');
  highlightEl.className = 'onboarding-highlight';
  highlightEl.style.display = 'none';
  overlayEl.appendChild(highlightEl);

  // Step card
  cardEl = document.createElement('div');
  cardEl.className = 'onboarding-step-card';
  cardEl.innerHTML = `
    <div class="onboarding-step-icon" id="onboardingStepIcon"></div>
    <h3 class="onboarding-step-title" id="onboardingStepTitle"></h3>
    <p class="onboarding-step-desc" id="onboardingStepDesc"></p>
    <div class="onboarding-indicator" id="onboardingIndicator"></div>
    <div class="onboarding-step-actions">
      <a href="#" class="onboarding-skip-link" id="onboardingSkip">跳过引导</a>
      <button class="btn btn-primary onboarding-next-btn" id="onboardingNext">下一步</button>
    </div>
  `;
  overlayEl.appendChild(cardEl);

  document.body.appendChild(overlayEl);

  // Bind events
  const skipLink = cardEl.querySelector('#onboardingSkip');
  const nextBtn = cardEl.querySelector('#onboardingNext');

  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    complete();
  });

  nextBtn.addEventListener('click', () => {
    nextStep();
  });

  // Handle window resize — reposition highlight
  const onResize = () => {
    if (isActive) renderStep(currentStep, false);
  };
  window.addEventListener('resize', onResize);
  resizeCleanup = () => window.removeEventListener('resize', onResize);
}

/**
 * Render a specific step.
 * @param {number} stepIndex — Step index (0-based)
 * @param {boolean} [animate=true] — Whether to animate the card
 */
function renderStep(stepIndex, animate = true) {
  if (!overlayEl || !cardEl) return;
  const step = steps[stepIndex];
  if (!step) return;

  // Update card content
  const iconEl = cardEl.querySelector('#onboardingStepIcon');
  const titleEl = cardEl.querySelector('#onboardingStepTitle');
  const descEl = cardEl.querySelector('#onboardingStepDesc');
  const nextBtn = cardEl.querySelector('#onboardingNext');

  if (iconEl) iconEl.innerHTML = getIllustration(step.icon);
  if (titleEl) titleEl.textContent = step.title;
  if (descEl) descEl.textContent = step.description;
  if (nextBtn) nextBtn.textContent = step.ctaText;

  // Update indicator
  renderIndicator(stepIndex);

  // Update card animation
  if (animate) {
    cardEl.classList.remove('animate-scale-in');
    void cardEl.offsetWidth; // force reflow
    cardEl.classList.add('animate-scale-in');
  }

  // Position highlight and card
  if (step.targetSelector) {
    const target = document.querySelector(step.targetSelector);
    if (target) {
      positionHighlight(target);
      positionCardNearTarget(target, step.cardPosition);
    } else {
      // Target not found — center the card
      highlightEl.style.display = 'none';
      positionCardCenter();
    }
  } else {
    // No target — center the card, no highlight
    highlightEl.style.display = 'none';
    positionCardCenter();
  }
}

/**
 * Render the step indicator (1/3, 2/3, 3/3).
 * @param {number} currentIdx — Current step index
 */
function renderIndicator(currentIdx) {
  if (!cardEl) return;
  indicatorEl = cardEl.querySelector('#onboardingIndicator');
  if (!indicatorEl) return;

  const dots = steps.map((_, i) => {
    const isActiveDot = i === currentIdx;
    const isPast = i < currentIdx;
    return `<span class="onboarding-dot ${isActiveDot ? 'active' : ''} ${isPast ? 'past' : ''}"></span>`;
  }).join('<span class="onboarding-dot-line"></span>');

  indicatorEl.innerHTML = `
    <div class="onboarding-dots">${dots}</div>
    <span class="onboarding-step-count">${currentIdx + 1} / ${steps.length}</span>
  `;
}

/**
 * Position the highlight box over a target element.
 * Uses box-shadow to create a dimmed overlay with a "hole" over the target.
 * @param {HTMLElement} target — Element to highlight
 */
function positionHighlight(target) {
  if (!highlightEl) return;
  const rect = target.getBoundingClientRect();
  const padding = 8;

  highlightEl.style.display = 'block';
  highlightEl.style.position = 'fixed';
  highlightEl.style.left = `${rect.left - padding}px`;
  highlightEl.style.top = `${rect.top - padding}px`;
  highlightEl.style.width = `${rect.width + padding * 2}px`;
  highlightEl.style.height = `${rect.height + padding * 2}px`;
  highlightEl.style.borderRadius = `${getComputedStyle(target).borderRadius || '8px'}`;

  // Use box-shadow to create the dimmed overlay around the highlight
  highlightEl.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.75)';
  highlightEl.style.zIndex = '9998';
  highlightEl.style.pointerEvents = 'none';

  // Add a glowing border
  highlightEl.style.border = '2px solid var(--color-brand-primary, #f59e0b)';
  highlightEl.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.75), 0 0 20px rgba(245, 158, 11, 0.4)';
}

/**
 * Position the step card in the center of the screen.
 */
function positionCardCenter() {
  if (!cardEl) return;
  cardEl.style.position = 'fixed';
  cardEl.style.left = '50%';
  cardEl.style.top = '50%';
  cardEl.style.transform = 'translate(-50%, -50%)';
  cardEl.style.zIndex = '9999';
}

/**
 * Position the step card near a target element.
 * @param {HTMLElement} target — Target element
 * @param {string} position — 'left' | 'bottom' | 'top' | 'right' | 'center'
 */
function positionCardNearTarget(target, position) {
  if (!cardEl) return;
  const rect = target.getBoundingClientRect();
  const cardWidth = 360;
  const cardMaxHeight = 400;
  const gap = 20;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left, top;

  switch (position) {
    case 'left':
      left = rect.left - cardWidth - gap;
      top = rect.top + rect.height / 2 - cardMaxHeight / 2;
      if (left < gap) left = rect.right + gap; // flip to right if no space
      break;
    case 'right':
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - cardMaxHeight / 2;
      if (left + cardWidth > viewportWidth - gap) left = rect.left - cardWidth - gap;
      break;
    case 'bottom':
      left = rect.left + rect.width / 2 - cardWidth / 2;
      top = rect.bottom + gap;
      if (top + cardMaxHeight > viewportHeight - gap) top = rect.top - cardMaxHeight - gap;
      break;
    case 'top':
      left = rect.left + rect.width / 2 - cardWidth / 2;
      top = rect.top - cardMaxHeight - gap;
      if (top < gap) top = rect.bottom + gap;
      break;
    default:
      positionCardCenter();
      return;
  }

  // Clamp to viewport
  left = Math.max(gap, Math.min(left, viewportWidth - cardWidth - gap));
  top = Math.max(gap, Math.min(top, viewportHeight - cardMaxHeight - gap));

  cardEl.style.position = 'fixed';
  cardEl.style.left = `${left}px`;
  cardEl.style.top = `${top}px`;
  cardEl.style.transform = 'none';
  cardEl.style.zIndex = '9999';
}

/**
 * Advance to the next step.
 * For step 1 (add item): check if user has added a record before proceeding.
 */
async function nextStep() {
  const step = steps[currentStep];

  // Step 1 (add item): verify user has added a record
  if (currentStep === 1) {
    const nextBtn = cardEl?.querySelector('#onboardingNext');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = '检查中...';
    }

    const hasRecords = await hasUserRecords();
    if (!hasRecords) {
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = step.ctaText;
      }
      if (window.toast) {
        window.toast.info('请先添加一件物品，然后点击「下一步」');
      }
      return;
    }

    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.textContent = step.ctaText;
    }
  }

  if (currentStep < steps.length - 1) {
    currentStep++;
    renderStep(currentStep);
  } else {
    complete();
  }
}

/**
 * Complete the onboarding flow.
 */
function complete() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  isActive = false;
  destroyOverlay();

  if (window.toast) {
    window.toast.success('引导完成！开始记录你的资产吧');
  }

  // Dispatch event for other modules
  document.dispatchEvent(new CustomEvent('daycost:onboarding-complete'));
}

/**
 * Remove the onboarding overlay and clean up listeners.
 */
function destroyOverlay() {
  if (resizeCleanup) {
    resizeCleanup();
    resizeCleanup = null;
  }
  if (overlayEl && overlayEl.parentNode) {
    overlayEl.parentNode.removeChild(overlayEl);
  }
  overlayEl = null;
  highlightEl = null;
  cardEl = null;
  indicatorEl = null;
}

export {
  initOnboarding,
  checkOnboardingStatus,
  start,
  complete
};
