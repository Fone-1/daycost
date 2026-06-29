/**
 * AuthView — Authentication view module for DayCost.
 * Handles login/register UI, form submission, auth state checking, and logout.
 * Uses ApiClient for HTTP requests instead of raw fetch.
 *
 * Version: 1.0.0
 */

import apiClient from './api-client.js';
import { validatePassword, validateUsername } from './validators.js';
import { loadHistory, loadStats } from './records-view.js';

/** @type {boolean} Whether the auth form is in login mode (true) or register mode (false) */
let isLoginMode = true;

/** @type {HTMLElement|null} Rate limiting countdown interval ID */
let rateLimitIntervalId = null;

/* ------------------------------------------------------------------ */
/*  DOM Element References                                              */
/* ------------------------------------------------------------------ */

const authSection = document.getElementById('authSection');
const dashboardSection = document.getElementById('dashboardSection');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const authForm = document.getElementById('authForm');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const logoutBtn = document.getElementById('logoutBtn');
const displayUsername = document.getElementById('displayUsername');
const changePwdBtn = document.getElementById('changePwdBtn');

// Password change modal elements
const passwordModal = document.getElementById('passwordModal');
const passwordModalCloseBtn = document.getElementById('passwordModalCloseBtn');
const passwordForm = document.getElementById('passwordForm');
const passwordError = document.getElementById('passwordError');
const oldPasswordInput = document.getElementById('oldPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

/* ------------------------------------------------------------------ */
/*  Auth State Management                                               */
/* ------------------------------------------------------------------ */

/**
 * Check current auth state from localStorage.
 * If JWT token and username exist, show dashboard; otherwise show login view.
 * This is the primary auth gate — called on page load and after login/register/logout.
 */
function checkAuth() {
  const token = localStorage.getItem('daycost_token');
  const username = localStorage.getItem('daycost_username');
  const globalStatsBox = document.getElementById('globalStatsBox');

  if (token && username) {
    // Authenticated — show dashboard
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    if (displayUsername) displayUsername.textContent = username;

    // Load profile & settings
    if (typeof window.initSettings === 'function') window.initSettings();

    // Dispatch event so other modules (ranking, onboarding) can react
    document.dispatchEvent(new CustomEvent('daycost:auth-success'));

    // Directly load data — ensures records appear even if event listener has issues
    loadHistory();
    loadStats();
  } else {
    // Not authenticated — show login view
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    if (globalStatsBox) globalStatsBox.classList.add('hidden');
  }
}

/* ------------------------------------------------------------------ */
/*  Login / Register Logic                                              */
/* ------------------------------------------------------------------ */

/**
 * Perform login via ApiClient.
 * On success: store JWT token, username, role, and CSRF token; then call checkAuth().
 * @param {string} username
 * @param {string} password
 */
async function login(username, password) {
  try {
    const data = await apiClient.post('/api/auth/login', { username, password });

    // Store auth data
    apiClient.setToken(data.token);
    localStorage.setItem('daycost_username', data.username);
    localStorage.setItem('daycost_role', data.role || 'user');

    // Store CSRF token returned by server
    if (data.csrfToken) apiClient.setCsrfToken(data.csrfToken);

    checkAuth();
    passwordInput.value = '';
  } catch (err) {
    showAuthError(err.message);
  }
}

/**
 * Perform registration via ApiClient.
 * On success: automatically log in with the same credentials.
 * @param {string} username
 * @param {string} password
 */
async function register(username, password) {
  try {
    // Register endpoint returns token + csrfToken; auto-login
    const data = await apiClient.post('/api/auth/register', { username, password });

    // Store auth data (register returns token directly for auto-login)
    if (data.token) {
      apiClient.setToken(data.token);
      localStorage.setItem('daycost_username', data.username || username);
      localStorage.setItem('daycost_role', data.role || 'user');

      if (data.csrfToken) apiClient.setCsrfToken(data.csrfToken);

      checkAuth();
      passwordInput.value = '';
    } else {
      // Fallback: if register doesn't return token, try login
      await login(username, password);
    }
  } catch (err) {
    showAuthError(err.message);
  }
}

/**
 * Display an error message in the auth form.
 * For rate limiting errors, shows a countdown timer that disables the submit button.
 * @param {string} msg — Error message to display
 */
function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');

  // Rate limiting countdown
  if (msg.includes('请求过于频繁')) {
    const match = msg.match(/(\d+)\s*分钟/);
    if (match) {
      let remainingSeconds = parseInt(match[1], 10) * 60;
      authSubmitBtn.disabled = true;
      authSubmitBtn.style.opacity = '0.5';
      authSubmitBtn.style.cursor = 'not-allowed';

      // Clear any existing countdown
      if (rateLimitIntervalId) clearInterval(rateLimitIntervalId);

      rateLimitIntervalId = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
          clearInterval(rateLimitIntervalId);
          rateLimitIntervalId = null;
          authSubmitBtn.disabled = false;
          authSubmitBtn.style.opacity = '1';
          authSubmitBtn.style.cursor = 'pointer';
          authError.classList.add('hidden');
          authError.textContent = '';
        } else {
          const mins = Math.floor(remainingSeconds / 60);
          const secs = remainingSeconds % 60;
          authError.textContent = `请求过于频繁，请 ${mins > 0 ? mins + '分' : ''}${secs}秒 后再试`;
        }
      }, 1000);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Change Password Logic                                               */
/* ------------------------------------------------------------------ */

/**
 * Open the password change modal.
 */
function openPasswordModal() {
  if (!passwordModal) return;
  passwordForm.reset();
  passwordError.classList.add('hidden');
  passwordModal.classList.remove('hidden');
}

/**
 * Handle password change form submission via ApiClient.
 */
async function handlePasswordChange(e) {
  e.preventDefault();

  const oldPw = oldPasswordInput.value;
  const newPw = newPasswordInput.value;
  const confirmPw = confirmPasswordInput.value;

  if (newPw !== confirmPw) {
    passwordError.textContent = '两次输入的新密码不一致';
    passwordError.classList.remove('hidden');
    return;
  }

  try {
    const data = await apiClient.put('/api/auth/password', {
      oldPassword: oldPw,
      newPassword: newPw
    });

    if (window.toast) window.toast.success(data.message || '密码已修改');
    passwordModal.classList.add('hidden');

    // Force re-login after password change
    handleLogout();
  } catch (err) {
    passwordError.textContent = err.message || '修改失败';
    passwordError.classList.remove('hidden');
  }
}

/* ------------------------------------------------------------------ */
/*  Logout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Handle logout: clear auth data and switch to login view.
 */
function handleLogout() {
  apiClient.clearAuth();
  checkAuth();
}

/* ------------------------------------------------------------------ */
/*  Auth-Expired Event Handler                                          */
/* ------------------------------------------------------------------ */

/**
 * Listen for auth-expired events from ApiClient (triggered on 401 responses).
 * Clears auth data and switches to login view.
 */
function onAuthExpired() {
  apiClient.clearAuth();
  checkAuth();
  if (window.toast) window.toast.warning('登录已过期，请重新登录');
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Initialize the auth view module.
 * Binds all event listeners for login/register tabs, form submission,
 * logout button, password change, and auth-expired events.
 */
function initAuthView() {
  // --- Tab switching ---
  if (tabLogin) {
    tabLogin.addEventListener('click', () => {
      isLoginMode = true;
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
      authSubmitBtn.textContent = '登录';
      authError.classList.add('hidden');
    });
  }

  if (tabRegister) {
    tabRegister.addEventListener('click', () => {
      isLoginMode = false;
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      authSubmitBtn.textContent = '注册并登录';
      authError.classList.add('hidden');
    });
  }

  // --- Auth form submission ---
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      // Frontend validation for register mode
      if (!isLoginMode) {
        const usernameResult = validateUsername(username);
        if (!usernameResult.valid) {
          showAuthError(usernameResult.errors[0]);
          return;
        }
        const passwordResult = validatePassword(password);
        if (!passwordResult.valid) {
          showAuthError(passwordResult.errors.join(', '));
          return;
        }
      }

      authSubmitBtn.classList.add('loading');
      authSubmitBtn.disabled = true;

      try {
        if (isLoginMode) {
          await login(username, password);
        } else {
          await register(username, password);
        }
      } finally {
        authSubmitBtn.classList.remove('loading');
        authSubmitBtn.disabled = false;
      }
    });
  }

  // --- Logout button ---
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // --- Change password ---
  if (changePwdBtn) {
    changePwdBtn.addEventListener('click', openPasswordModal);
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', handlePasswordChange);
  }

  // --- Password modal close ---
  if (passwordModalCloseBtn) {
    passwordModalCloseBtn.addEventListener('click', () => {
      passwordModal.classList.add('hidden');
    });
  }
  if (passwordModal) {
    passwordModal.addEventListener('click', (e) => {
      if (e.target === passwordModal) passwordModal.classList.add('hidden');
    });
  }

  // --- Auth-expired event from ApiClient ---
  document.addEventListener('daycost:auth-expired', onAuthExpired);
}

export { initAuthView, checkAuth, handleLogout };
