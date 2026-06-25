/**
 * DayCost Toast Notification System
 * Version: 2.0.0
 *
 * Provides non-intrusive, animated feedback for user actions.
 * Supports multiple simultaneous toasts, hover-to-pause, and
 * configurable position / duration / max count.
 */

class ToastManager {
  /**
   * Create a new ToastManager.
   * @param {Object}  options
   * @param {number}  options.maxToasts      - Max visible toasts (default 5)
   * @param {number}  options.defaultDuration - Default auto-dismiss ms (3000)
   * @param {string}  options.position        - Container position class
   * @param {boolean} options.pauseOnHover    - Pause timer on hover (true)
   */
  constructor(options = {}) {
    this.maxToasts = options.maxToasts || 5;
    this.defaultDuration = options.defaultDuration || 3000;
    this.position = options.position || 'bottom-center';
    this.pauseOnHover = options.pauseOnHover !== undefined ? options.pauseOnHover : true;

    /** @type {Array<{id:string, el:HTMLElement, timer:number|null, paused:boolean, start:number, remaining:number}>} */
    this.toasts = [];
    this._idCounter = 0;
    this.container = null;
    this._styleEl = null;
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Private: bootstrap container + inject styles if missing           */
  /* ------------------------------------------------------------------ */
  _init() {
    this._injectStyles();

    this.container = document.createElement('div');
    this.container.className = `dc-toast-container dc-toast-${this.position}`;
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.container);

    if (this.pauseOnHover) {
      this.container.addEventListener('mouseenter', () => this._pauseAll());
      this.container.addEventListener('mouseleave', () => this._resumeAll());
    }
  }

  _injectStyles() {
    if (document.getElementById('dc-toast-styles')) return;
    const s = document.createElement('style');
    s.id = 'dc-toast-styles';
    s.textContent = `
/* ---- Toast Container ---- */
.dc-toast-container {
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
  max-width: 420px;
  width: calc(100% - 32px);
}
.dc-toast-bottom-center { bottom: 24px; left: 50%; transform: translateX(-50%); }
.dc-toast-top-right     { top: 24px; right: 24px; flex-direction: column; }
.dc-toast-bottom-right  { bottom: 24px; right: 24px; }

/* ---- Toast Item ---- */
.dc-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg-elevated, #1a2236);
  border: 1px solid var(--border-color, rgba(255,255,255,0.06));
  border-left: 4px solid var(--info, #3b82f6);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  color: var(--text-color, #f1f5f9);
  font-size: 0.9rem;
  line-height: 1.5;
  pointer-events: auto;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.35s cubic-bezier(.4,0,.2,1),
              transform 0.35s cubic-bezier(.4,0,.2,1);
  position: relative;
  overflow: hidden;
}
.dc-toast.dc-toast-show {
  opacity: 1;
  transform: translateY(0);
}
.dc-toast.dc-toast-hide {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

/* Type colours */
.dc-toast-success { border-left-color: var(--success, #10b981); }
.dc-toast-error   { border-left-color: var(--danger, #ef4444); }
.dc-toast-warning { border-left-color: var(--warning, #f59e0b); }
.dc-toast-info    { border-left-color: var(--info, #3b82f6); }

/* Icon */
.dc-toast-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.dc-toast-success .dc-toast-icon { background: rgba(16,185,129,0.15); color: #10b981; }
.dc-toast-error   .dc-toast-icon { background: rgba(239,68,68,0.15);   color: #ef4444; }
.dc-toast-warning .dc-toast-icon { background: rgba(245,158,11,0.15); color: #f59e0b; }
.dc-toast-info    .dc-toast-icon { background: rgba(59,130,246,0.15); color: #3b82f6; }

/* Close button */
.dc-toast-close {
  background: none;
  border: none;
  color: var(--text-muted, #8494a7);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.15s;
  flex-shrink: 0;
  margin-left: auto;
}
.dc-toast-close:hover { opacity: 1; }

/* Progress bar */
.dc-toast-progress {
  position: absolute;
  left: 0; bottom: 0;
  height: 3px;
  background: var(--info, #3b82f6);
  border-radius: 0 0 0 12px;
  transition: width linear;
  will-change: width;
}
.dc-toast-success .dc-toast-progress { background: var(--success, #10b981); }
.dc-toast-error   .dc-toast-progress { background: var(--danger, #ef4444); }
.dc-toast-warning .dc-toast-progress { background: var(--warning, #f59e0b); }
    `;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Show a toast.
   * @param {string} message
   * @param {string} type    - 'success'|'error'|'warning'|'info'
   * @param {number} duration - ms; 0 = manual dismiss only
   * @returns {string} toast id
   */
  show(message, type = 'info', duration = null) {
    if (duration === null) duration = this.defaultDuration;

    // Evict oldest if at capacity
    if (this.toasts.length >= this.maxToasts) {
      this._dismissById(this.toasts[0].id);
    }

    const id = `dc-toast-${++this._idCounter}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    const el = document.createElement('div');
    el.id = id;
    el.className = `dc-toast dc-toast-${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="dc-toast-icon">${icons[type] || icons.info}</span>
      <span class="dc-toast-msg">${this._esc(message)}</span>
      <button class="dc-toast-close" aria-label="关闭">&times;</button>
      ${duration > 0 ? '<div class="dc-toast-progress"></div>' : ''}
    `;

    // Close button
    el.querySelector('.dc-toast-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss(id);
    });

    // Hover-pause on individual toast
    if (this.pauseOnHover) {
      el.addEventListener('mouseenter', () => this._pause(id));
      el.addEventListener('mouseleave', () => this._resume(id));
    }

    // Progress bar setup
    const bar = el.querySelector('.dc-toast-progress');
    if (bar && duration > 0) {
      requestAnimationFrame(() => {
        bar.style.width = '0%';
        bar.style.transitionDuration = duration + 'ms';
      });
    }

    this.container.appendChild(el);

    const entry = {
      id,
      el,
      timer: null,
      paused: false,
      start: Date.now(),
      remaining: duration,
      duration
    };

    this.toasts.push(entry);

    // Trigger enter animation
    requestAnimationFrame(() => el.classList.add('dc-toast-show'));

    // Auto-dismiss
    if (duration > 0) {
      entry.timer = setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  success(message, duration) { return this.show(message, 'success', duration); }
  error(message, duration)   { return this.show(message, 'error', duration); }
  warning(message, duration) { return this.show(message, 'warning', duration); }
  info(message, duration)    { return this.show(message, 'info', duration); }

  /**
   * Dismiss a toast by id.
   * @param {string} id
   */
  dismiss(id) { this._dismissById(id); }

  /** Remove all visible toasts. */
  clear() {
    [...this.toasts].forEach(t => this._dismissById(t.id));
  }

  /** Tear down the manager and remove the container from the DOM. */
  destroy() {
    this.clear();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    const st = document.getElementById('dc-toast-styles');
    if (st) st.remove();
    this.container = null;
    this.toasts = [];
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  _dismissById(id) {
    const idx = this.toasts.findIndex(t => t.id === id);
    if (idx === -1) return;
    const entry = this.toasts[idx];

    if (entry.timer) clearTimeout(entry.timer);

    entry.el.classList.remove('dc-toast-show');
    entry.el.classList.add('dc-toast-hide');

    setTimeout(() => {
      if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    }, 280);

    this.toasts.splice(idx, 1);
  }

  _pause(id) {
    const entry = this.toasts.find(t => t.id === id);
    if (!entry || entry.paused) return;
    entry.paused = true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.start));
    const bar = entry.el.querySelector('.dc-toast-progress');
    if (bar) bar.style.animationPlayState = 'paused';
  }

  _resume(id) {
    const entry = this.toasts.find(t => t.id === id);
    if (!entry || !entry.paused) return;
    entry.paused = false;
    entry.start = Date.now();
    if (entry.remaining > 0) {
      entry.timer = setTimeout(() => this.dismiss(id), entry.remaining);
    }
    const bar = entry.el.querySelector('.dc-toast-progress');
    if (bar) bar.style.animationPlayState = 'running';
  }

  _pauseAll()  { this.toasts.forEach(t => this._pause(t.id)); }
  _resumeAll() { this.toasts.forEach(t => this._resume(t.id)); }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

// Create global singleton
window.toast = new ToastManager({
  maxToasts: 5,
  defaultDuration: 3000,
  position: 'bottom-center',
  pauseOnHover: true
});
