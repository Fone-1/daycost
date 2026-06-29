/**
 * Unit Tests for CSRF Middleware — csrf.js
 *
 * Tests:
 *   - generateToken() — produces 64-char hex string
 *   - setCsrfCookie() — sets correct Set-Cookie header
 *   - csrfMiddleware() — GET exempt, POST validates cookie/header match, 403 on mismatch
 */

const { generateToken, setCsrfCookie, csrfMiddleware, COOKIE_NAME, HEADER_NAME } = require('../src/middlewares/csrf');

// ─── Mock Express objects ────────────────────────────────────────────────────

function createMockRequest(method = 'GET', cookieStr = '', headerValue = '') {
  return {
    method,
    headers: {
      cookie: cookieStr,
      [HEADER_NAME.toLowerCase()]: headerValue
    }
  };
}

function createMockResponse() {
  const headers = {};
  let statusCode = 200;
  let responseBody = null;

  return {
    headers,
    setHeader(key, value) {
      headers[key] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
    getStatusCode() { return statusCode; },
    getBody() { return responseBody; }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CSRF Middleware', () => {

  // ─── 1. generateToken ───────────────────────────────────────────────────

  describe('generateToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = generateToken();
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate cryptographically random tokens (not predictable)', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }
      // All 100 tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });

  // ─── 2. setCsrfCookie ───────────────────────────────────────────────────

  describe('setCsrfCookie', () => {
    it('should set Set-Cookie header with correct format', () => {
      const res = createMockResponse();
      const token = 'abc123token456';
      setCsrfCookie(res, token);

      const cookieHeader = res.headers['Set-Cookie'];
      expect(cookieHeader).toContain(`${COOKIE_NAME}=${token}`);
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Path=/');
      expect(cookieHeader).toContain('HttpOnly=false');
    });

    it('should include the generated token value in the cookie', () => {
      const res = createMockResponse();
      const token = generateToken();
      setCsrfCookie(res, token);

      expect(res.headers['Set-Cookie']).toContain(token);
    });
  });

  // ─── 3. csrfMiddleware — GET exempt ────────────────────────────────────

  describe('csrfMiddleware — GET request exemption', () => {
    it('should pass through GET requests without validation', () => {
      const req = createMockRequest('GET');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
      expect(res.getStatusCode()).toBe(200);
    });

    it('should pass through GET requests even without CSRF cookie/header', () => {
      const req = createMockRequest('GET', '', '');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });
  });

  // ─── 4. csrfMiddleware — POST validation ────────────────────────────────

  describe('csrfMiddleware — POST validation', () => {
    it('should pass POST request when cookie and header match', () => {
      const token = generateToken();
      const cookieStr = `${COOKIE_NAME}=${token}`;
      const req = createMockRequest('POST', cookieStr, token);
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it('should return 403 when cookie and header do not match', () => {
      const req = createMockRequest('POST', `${COOKIE_NAME}=tokenA`, 'tokenB');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.getStatusCode()).toBe(403);
      expect(res.getBody().error).toBe('CSRF token mismatch');
    });

    it('should return 403 when CSRF cookie is missing', () => {
      const req = createMockRequest('POST', '', 'someToken');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.getStatusCode()).toBe(403);
    });

    it('should return 403 when CSRF header is missing', () => {
      const token = generateToken();
      const req = createMockRequest('POST', `${COOKIE_NAME}=${token}`, '');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.getStatusCode()).toBe(403);
    });

    it('should return 403 when both cookie and header are missing', () => {
      const req = createMockRequest('POST', '', '');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.getStatusCode()).toBe(403);
    });
  });

  // ─── 5. csrfMiddleware — other mutating methods ─────────────────────────

  describe('csrfMiddleware — PUT/DELETE/PATCH validation', () => {
    it('should validate PUT requests (same as POST)', () => {
      const token = generateToken();
      const req = createMockRequest('PUT', `${COOKIE_NAME}=${token}`, token);
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it('should validate DELETE requests', () => {
      const req = createMockRequest('DELETE', '', '');
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.getStatusCode()).toBe(403);
    });

    it('should validate PATCH requests', () => {
      const token = generateToken();
      const req = createMockRequest('PATCH', `${COOKIE_NAME}=${token}`, token);
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });
  });

  // ─── 6. Double Submit Cookie pattern verification ────────────────────────

  describe('Double Submit Cookie pattern', () => {
    it('should enforce cookie-header equality (not just existence)', () => {
      // Different values → 403
      const req = createMockRequest('POST', `${COOKIE_NAME}=abc`, 'def');
      const res = createMockResponse();
      const next = () => {};

      csrfMiddleware(req, res, next);
      expect(res.getStatusCode()).toBe(403);
    });

    it('should correctly parse cookie with multiple cookies', () => {
      const token = generateToken();
      const cookieStr = `otherCookie=value; ${COOKIE_NAME}=${token}; session=xyz`;
      const req = createMockRequest('POST', cookieStr, token);
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      csrfMiddleware(req, res, next);
      expect(nextCalled).toBe(true);
    });
  });
});
