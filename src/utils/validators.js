/**
 * Input Validation Utilities for DayCost
 *
 * Provides password complexity and username format validation functions.
 * Used by both backend auth routes (registration, password change) and
 * can be mirrored on the frontend for real-time form feedback.
 */

// ─── Password Validation ────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate password complexity.
 * Rules: minimum 8 characters + at least 1 digit + at least 1 uppercase letter.
 *
 * @param {string} password - The password to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required.'] };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit (0-9).');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ─── Username Validation ────────────────────────────────────────────────────

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Validate username format.
 * Rules: 3-20 characters, only letters, digits, and underscores allowed.
 *
 * @param {string} username - The username to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result with error messages
 */
function validateUsername(username) {
  const errors = [];

  if (!username || typeof username !== 'string') {
    return { valid: false, errors: ['Username is required.'] };
  }

  if (username.length < MIN_USERNAME_LENGTH) {
    errors.push(`Username must be at least ${MIN_USERNAME_LENGTH} characters long.`);
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    errors.push(`Username must be at most ${MAX_USERNAME_LENGTH} characters long.`);
  }

  if (!USERNAME_PATTERN.test(username)) {
    errors.push('Username can only contain letters, digits, and underscores.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validatePassword,
  validateUsername,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN
};
