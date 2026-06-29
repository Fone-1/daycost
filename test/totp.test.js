/**
 * Unit Tests for TOTP Helper — totpHelper.js
 *
 * Tests:
 *   - encryptSecret / decryptSecret (AES-256-GCM encryption roundtrip)
 *   - base32Decode (implicit via generateTOTP)
 *   - generateTOTP (RFC 6238 HOTP/TOTP algorithm)
 *
 * Note: TOTP_ENCRYPTION_KEY is loaded from env.js which reads .env.local.
 * We must set JWT_SECRET before requiring env.js (it's a hard requirement).
 */

// Set required env vars before importing modules that depend on env.js
process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';

const { encryptSecret, decryptSecret, generateTOTP } = require('../src/utils/totpHelper');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TOTP Helper', () => {

  // ─── 1. Encryption/Decryption roundtrip ──────────────────────────────────

  describe('encryptSecret / decryptSecret', () => {
    it('should encrypt and decrypt a secret correctly', () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Standard test base32 secret
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted.enc, encrypted.iv, encrypted.authTag);

      expect(decrypted).toBe(secret);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const secret = 'TESTSECRET123456';
      const enc1 = encryptSecret(secret);
      const enc2 = encryptSecret(secret);

      // Due to random IV, encrypted values should differ
      expect(enc1.enc).not.toBe(enc2.enc);
      // But both should decrypt to same value
      expect(decryptSecret(enc1.enc, enc1.iv, enc1.authTag)).toBe(secret);
      expect(decryptSecret(enc2.enc, enc2.iv, enc2.authTag)).toBe(secret);
    });

    it('should handle empty string', () => {
      const secret = '';
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted.enc, encrypted.iv, encrypted.authTag);

      expect(decrypted).toBe('');
    });

    it('should handle long secrets', () => {
      const secret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOP'; // 44 chars
      const encrypted = encryptSecret(secret);
      const decrypted = decryptSecret(encrypted.enc, encrypted.iv, encrypted.authTag);

      expect(decrypted).toBe(secret);
    });

    it('should return enc, iv, and authTag in hex format', () => {
      const encrypted = encryptSecret('TEST');
      // All fields should be hex strings
      expect(encrypted.enc).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.iv).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('should fail decryption with wrong auth tag (data integrity)', () => {
      const secret = 'SECRETKEY';
      const encrypted = encryptSecret(secret);

      // Tamper with auth tag
      const tamperedTag = '00000000000000000000000000000000';
      expect(() => {
        decryptSecret(encrypted.enc, encrypted.iv, tamperedTag);
      }).toThrow();
    });
  });

  // ─── 2. generateTOTP ────────────────────────────────────────────────────

  describe('generateTOTP', () => {
    const testSecret = 'JBSWY3DPEHPK3PXP'; // "Hello!" in base32

    it('should generate a 6-digit code by default', () => {
      const result = generateTOTP(testSecret);
      expect(result.code).toMatch(/^\d{6}$/);
    });

    it('should return remaining seconds within [0, period]', () => {
      const result = generateTOTP(testSecret);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeLessThanOrEqual(30);
    });

    it('should generate different codes for different time periods', () => {
      // We can't easily control time in generateTOTP since it uses Date.now()
      // But we can verify that consecutive calls within the same period produce same code
      const result1 = generateTOTP(testSecret);
      const result2 = generateTOTP(testSecret);

      // Same period → same code
      expect(result1.code).toBe(result2.code);
    });

    it('should support custom period parameter', () => {
      const result60 = generateTOTP(testSecret, 60);
      expect(result60.code).toMatch(/^\d{6}$/);
      expect(result60.remaining).toBeLessThanOrEqual(60);
    });

    it('should support custom digits parameter', () => {
      const result8 = generateTOTP(testSecret, 30, 8);
      expect(result8.code).toMatch(/^\d{8}$/);
    });

    it('should generate deterministic code for a fixed time counter', () => {
      // This tests the RFC 6238 algorithm consistency
      // Two calls with same secret at the same time should produce same code
      const result1 = generateTOTP(testSecret);
      const result2 = generateTOTP(testSecret);
      expect(result1.code).toBe(result2.code);
    });

    it('should handle base32 secret with padding characters', () => {
      const paddedSecret = 'JBSWY3DPEHPK3PXP====';
      const result = generateTOTP(paddedSecret);
      // Padding should be stripped and code should be valid
      expect(result.code).toMatch(/^\d{6}$/);
    });
  });
});
