/**
 * CSRF Protection Middleware — Double Submit Cookie Pattern
 *
 * Strategy: On CSRF token generation, a random token is set as a cookie (_csrf)
 * and also returned to the client. For every mutating request (POST/PUT/DELETE/PATCH),
 * the middleware compares the cookie value with the X-CSRF-Token header value.
 * GET requests are exempt from CSRF validation.
 *
 * Express 5 does not include cookie-parser, so we use the `cookie` package
 * to manually parse req.headers.cookie.
 */

const crypto = require('crypto');
const cookie = require('cookie');

const COOKIE_NAME = '_csrf';
const HEADER_NAME = 'X-CSRF-Token';
const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically random CSRF token (32 bytes → hex string).
 * @returns {string} 64-character hex string
 */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Set the CSRF token as a cookie on the response.
 * Cookie attributes: SameSite=Strict, Path=/api, HttpOnly=false (readable by JS for header echo).
 * @param {import('express').Response} res - Express response object
 * @param {string} token - CSRF token value
 */
function setCsrfCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; SameSite=Lax; Path=/; HttpOnly=false`
  );
}

/**
 * CSRF validation middleware for Express.
 * Exempts GET requests. For all mutating methods (POST, PUT, DELETE, PATCH),
 * compares cookie _csrf value with X-CSRF-Token header value.
 * Returns 403 with {error: "CSRF token mismatch"} if validation fails.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 */
function csrfMiddleware(req, res, next) {
  // GET requests are exempt from CSRF validation
  if (req.method === 'GET') {
    return next();
  }

  // Parse cookies from request header
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookie.parse(cookieHeader);
  const csrfCookieValue = cookies[COOKIE_NAME];

  // Read CSRF token from custom header
  const csrfHeaderValue = req.headers[HEADER_NAME.toLowerCase()] || req.headers[HEADER_NAME];

  // Both cookie and header must exist and match
  if (!csrfCookieValue || !csrfHeaderValue || csrfCookieValue !== csrfHeaderValue) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
}

module.exports = {
  COOKIE_NAME,
  HEADER_NAME,
  generateToken,
  setCsrfCookie,
  csrfMiddleware
};
