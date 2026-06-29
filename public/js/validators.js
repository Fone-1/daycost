/**
 * Frontend Validators for DayCost.
 * Mirrors the backend validation rules from src/utils/validators.js.
 *
 * Password rules: minimum 8 characters + at least 1 digit + at least 1 uppercase letter.
 * Username rules: 3-20 characters, only letters, digits, and underscores allowed.
 *
 * Version: 1.0.0
 */

const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

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
    return { valid: false, errors: ['密码不能为空'] };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`);
  }

  if (!/\d/.test(password)) {
    errors.push('密码必须包含至少一个数字 (0-9)');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母 (A-Z)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

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
    return { valid: false, errors: ['用户名不能为空'] };
  }

  if (username.length < MIN_USERNAME_LENGTH) {
    errors.push(`用户名至少需要 ${MIN_USERNAME_LENGTH} 个字符`);
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    errors.push(`用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符`);
  }

  if (!USERNAME_PATTERN.test(username)) {
    errors.push('用户名只能包含字母、数字和下划线');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export {
  validatePassword,
  validateUsername,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN
};
