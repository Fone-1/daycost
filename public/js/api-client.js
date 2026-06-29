/**
 * ApiClient — Unified HTTP request layer for DayCost frontend.
 * Encapsulates fetch + JWT authentication + CSRF token management + error handling.
 *
 * localStorage keys:
 *   daycost_token      — JWT access token
 *   daycost_csrf_token — CSRF token for Double Submit Cookie pattern
 *
 * CSRF Cookie name: _csrf (set by server via Set-Cookie header)
 * CSRF Header name: X-CSRF-Token (sent by client on mutating requests)
 *
 * Version: 1.0.0
 */

const TOKEN_KEY = 'daycost_token';
const CSRF_KEY = 'daycost_csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';
const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

class ApiClient {
  constructor() {
    /** @type {string|null} Cached JWT token for fast access */
    this._token = localStorage.getItem(TOKEN_KEY);
    /** @type {string|null} Cached CSRF token for fast access */
    this._csrfToken = localStorage.getItem(CSRF_KEY);
  }

  /* ------------------------------------------------------------------ */
  /*  Token Management                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Get the current JWT token.
   * @returns {string|null}
   */
  getToken() {
    if (!this._token) this._token = localStorage.getItem(TOKEN_KEY);
    return this._token;
  }

  /**
   * Get the current CSRF token.
   * @returns {string|null}
   */
  getCsrfToken() {
    if (!this._csrfToken) this._csrfToken = localStorage.getItem(CSRF_KEY);
    return this._csrfToken;
  }

  /**
   * Store a new JWT token in localStorage and cache.
   * @param {string} token
   */
  setToken(token) {
    this._token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Store a new CSRF token in localStorage and cache.
   * @param {string} csrfToken
   */
  setCsrfToken(csrfToken) {
    this._csrfToken = csrfToken;
    localStorage.setItem(CSRF_KEY, csrfToken);
  }

  /**
   * Clear all auth-related data from localStorage and cache.
   * Called on 401 Unauthorized responses or explicit logout.
   */
  clearAuth() {
    this._token = null;
    this._csrfToken = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CSRF_KEY);
    localStorage.removeItem('daycost_username');
    localStorage.removeItem('daycost_role');
  }

  /**
   * Refresh CSRF token by calling GET /api/auth/csrf-token.
   * The server sets the _csrf cookie via Set-Cookie header and
   * returns { csrfToken } in the response body.
   * @returns {Promise<string>} The new CSRF token
   */
  async refreshCsrfToken() {
    try {
      const res = await fetch('/api/auth/csrf-token');
      if (!res.ok) {
        console.warn('[ApiClient] CSRF token refresh failed:', res.status);
        return '';
      }
      const data = await res.json();
      this.setCsrfToken(data.csrfToken);
      return data.csrfToken;
    } catch (err) {
      console.warn('[ApiClient] CSRF token refresh error:', err);
      return '';
    }
  }

  /**
   * Build the legacy getHeaders() object for backward compatibility
   * with non-module scripts (settings.js, totp.js) that use raw fetch.
   * @returns {Object} Headers object with Content-Type and Authorization
   */
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  /* ------------------------------------------------------------------ */
  /*  Core Request Method                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Execute an HTTP request with automatic JWT and CSRF token handling.
   *
   * Behavior:
   *  - Automatically attaches Authorization: Bearer <token> header if JWT exists
   *  - Automatically attaches X-CSRF-Token header for mutating requests (POST/PUT/DELETE/PATCH)
   *  - On 401 Unauthorized: clears auth data and dispatches 'daycost:auth-expired' event
   *  - On 403 with CSRF mismatch: refreshes CSRF token and retries the request once
   *  - On non-2xx responses: throws Error with server error message
   *
   * @param {string} url — Request URL (relative or absolute)
   * @param {Object} [options] — Fetch options
   * @param {string} [options.method] — HTTP method
   * @param {Object} [options.headers] — Additional headers
   * @param {string} [options.body] — Request body (JSON string for mutating requests)
   * @returns {Promise<Object>} Parsed JSON response data
   * @throws {Error} On network failure, 401, 403 (non-CSRF), or non-2xx status
   */
  async request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutating = MUTATING_METHODS.includes(method);

    // Build headers — preserve any caller-provided headers
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (isMutating) {
      const csrfToken = this.getCsrfToken();
      if (csrfToken) headers[CSRF_HEADER] = csrfToken;
      // Set Content-Type for JSON bodies if not already specified
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const fetchOptions = { ...options, headers };

    let res;
    try {
      res = await fetch(url, fetchOptions);
    } catch (networkErr) {
      // Network-level error (offline, DNS failure, etc.)
      throw networkErr;
    }

    // --- 401 Unauthorized ---
    if (res.status === 401) {
      this.clearAuth();
      document.dispatchEvent(new CustomEvent('daycost:auth-expired'));
      throw new Error('登录已过期，请重新登录');
    }

    // --- 403 Forbidden — check for CSRF token mismatch ---
    if (res.status === 403) {
      let errorData = {};
      try { errorData = await res.json(); } catch (_) { /* non-JSON response */ }

      if (errorData.error === 'CSRF token mismatch') {
        // Refresh CSRF token and retry once
        const newCsrfToken = await this.refreshCsrfToken();
        if (newCsrfToken) {
          const retryHeaders = { ...headers, [CSRF_HEADER]: newCsrfToken };
          const retryOptions = { ...fetchOptions, headers: retryHeaders };
          const retryRes = await fetch(url, retryOptions);

          if (retryRes.status === 401) {
            this.clearAuth();
            document.dispatchEvent(new CustomEvent('daycost:auth-expired'));
            throw new Error('登录已过期，请重新登录');
          }

          if (!retryRes.ok) {
            let retryData = {};
            try { retryData = await retryRes.json(); } catch (_) { /* non-JSON */ }
            throw new Error(retryData.error || `请求失败 (状态 ${retryRes.status})`);
          }

          return await retryRes.json();
        }
        // CSRF refresh failed — treat as regular 403
      }

      throw new Error(errorData.error || '操作被禁止');
    }

    // --- 429 Rate Limited ---
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const seconds = retryAfter ? Math.ceil(parseInt(retryAfter, 10)) : 900;
      const minutes = Math.ceil(seconds / 60);
      throw new Error(`请求过于频繁，请 ${minutes} 分钟后再试`);
    }

    // --- Non-2xx responses ---
    if (!res.ok) {
      let errorData = {};
      try { errorData = await res.json(); } catch (_) { /* non-JSON response */ }
      throw new Error(errorData.error || `请求失败 (状态 ${res.status})`);
    }

    // --- Success — parse JSON response ---
    return await res.json();
  }

  /* ------------------------------------------------------------------ */
  /*  Convenience Methods                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * GET request — read-only, no CSRF token needed.
   * @param {string} url
   * @param {Object} [extraHeaders] — Additional headers to merge
   * @returns {Promise<Object>}
   */
  get(url, extraHeaders = {}) {
    return this.request(url, { method: 'GET', headers: extraHeaders });
  }

  /**
   * POST request — creates a resource, requires CSRF token.
   * @param {string} url
   * @param {Object} data — Request body (will be JSON-serialized)
   * @returns {Promise<Object>}
   */
  post(url, data) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request — updates a resource, requires CSRF token.
   * @param {string} url
   * @param {Object} data — Request body (will be JSON-serialized)
   * @returns {Promise<Object>}
   */
  put(url, data) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request — removes a resource, requires CSRF token.
   * @param {string} url
   * @returns {Promise<Object>}
   */
  delete(url) {
    return this.request(url, { method: 'DELETE' });
  }
}

// Create singleton instance
const apiClient = new ApiClient();

export default apiClient;
export { ApiClient };
