/**
 * Unit Tests for Validators — validators.js
 *
 * Tests validatePassword() and validateUsername() for:
 *   - Empty/null/invalid inputs
 *   - Boundary conditions (min/max length)
 *   - Character composition requirements
 *   - Valid inputs
 */

const {
  validatePassword,
  validateUsername,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN
} = require('../src/utils/validators');

// ─── Password Validation ────────────────────────────────────────────────────

describe('validatePassword', () => {

  // ─── Invalid inputs ─────────────────────────────────────────────────────

  it('should reject empty string', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('Password is required.');
  });

  it('should reject null', () => {
    const result = validatePassword(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password is required.');
  });

  it('should reject undefined', () => {
    const result = validatePassword(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password is required.');
  });

  it('should reject non-string types (number)', () => {
    const result = validatePassword(12345678);
    expect(result.valid).toBe(false);
  });

  // ─── Length requirements ────────────────────────────────────────────────

  it('should reject short password (< 8 characters)', () => {
    const result = validatePassword('Ab1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  });

  it('should accept password at minimum length (8 characters) with all requirements', () => {
    const result = validatePassword('Abcd1234');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject 7-character password that meets other requirements', () => {
    const result = validatePassword('Abc1234');
    expect(result.valid).toBe(false);
  });

  // ─── Character composition ──────────────────────────────────────────────

  it('should reject password without digits', () => {
    const result = validatePassword('Abcdefgh');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one digit (0-9).');
  });

  it('should reject password without uppercase letters', () => {
    const result = validatePassword('abcd1234');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter (A-Z).');
  });

  it('should accept valid password with all requirements', () => {
    const result = validatePassword('StrongPass1');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should accept password with mixed special characters as long as it has digit+uppercase+8chars', () => {
    const result = validatePassword('P@ssw0rd!');
    expect(result.valid).toBe(true);
  });

  // ─── Multiple errors ────────────────────────────────────────────────────

  it('should return multiple errors for password that fails multiple rules', () => {
    const result = validatePassword('ab');
    // Fails: too short, no digit, no uppercase
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  // ─── Long valid passwords ──────────────────────────────────────────────

  it('should accept very long valid passwords', () => {
    const result = validatePassword('VeryLongSecurePassword12345');
    expect(result.valid).toBe(true);
  });
});

// ─── Username Validation ────────────────────────────────────────────────────

describe('validateUsername', () => {

  // ─── Invalid inputs ─────────────────────────────────────────────────────

  it('should reject empty string', () => {
    const result = validateUsername('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username is required.');
  });

  it('should reject null', () => {
    const result = validateUsername(null);
    expect(result.valid).toBe(false);
  });

  it('should reject undefined', () => {
    const result = validateUsername(undefined);
    expect(result.valid).toBe(false);
  });

  // ─── Length requirements ────────────────────────────────────────────────

  it('should reject username shorter than 3 characters', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Username must be at least ${MIN_USERNAME_LENGTH} characters long.`);
  });

  it('should accept username at minimum length (3 characters)', () => {
    const result = validateUsername('abc');
    expect(result.valid).toBe(true);
  });

  it('should reject username longer than 20 characters', () => {
    const result = validateUsername('verylongusernameexceeds');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Username must be at most ${MAX_USERNAME_LENGTH} characters long.`);
  });

  it('should accept username at maximum length (20 characters)', () => {
    const result = validateUsername('twentycharactersss00');  // exactly 20 chars
    expect(result.valid).toBe(true);
  });

  it('should accept username at 21 characters and reject', () => {
    const result = validateUsername('exactly21characterssss');
    expect(result.valid).toBe(false);
  });

  // ─── Character composition ──────────────────────────────────────────────

  it('should reject username with special characters', () => {
    const result = validateUsername('user@name');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Username can only contain letters, digits, and underscores.');
  });

  it('should reject username with spaces', () => {
    const result = validateUsername('user name');
    expect(result.valid).toBe(false);
  });

  it('should reject username with hyphens', () => {
    const result = validateUsername('user-name');
    expect(result.valid).toBe(false);
  });

  it('should accept username with underscores', () => {
    const result = validateUsername('user_name');
    expect(result.valid).toBe(true);
  });

  it('should accept username with digits', () => {
    const result = validateUsername('user123');
    expect(result.valid).toBe(true);
  });

  it('should accept username with mixed letters, digits, underscores', () => {
    const result = validateUsername('John_Doe42');
    expect(result.valid).toBe(true);
  });

  // ─── Pattern validation ─────────────────────────────────────────────────

  it('should reject username with Chinese characters', () => {
    const result = validateUsername('用户名');
    expect(result.valid).toBe(false);
  });

  it('should reject username with emoji', () => {
    const result = validateUsername('user😊');
    expect(result.valid).toBe(false);
  });

  // ─── Multiple errors ────────────────────────────────────────────────────

  it('should return multiple errors for username failing multiple rules', () => {
    // 1 char + special char → fails length + pattern
    const result = validateUsername('!');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Edge: valid underscores-only ───────────────────────────────────────

  it('should accept underscore-only username of valid length', () => {
    const result = validateUsername('___');
    expect(result.valid).toBe(true);
  });

  it('should accept digit-only username of valid length', () => {
    const result = validateUsername('123');
    expect(result.valid).toBe(true);
  });
});
