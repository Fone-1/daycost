const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ─── Load .env.local (dev overrides, never committed) ────────────────────────
const ENV_LOCAL_PATH = path.join(__dirname, '../../.env.local');

/**
 * Parse a simple .env file (KEY=VALUE lines) and merge into process.env.
 * Skips empty lines and comments (#). Does not override existing env vars.
 * @param {string} filePath - Absolute path to the .env file
 * @returns {object} parsed key-value pairs
 */
function parseEnvFile(filePath) {
  const parsed = {};
  if (!fs.existsSync(filePath)) {
    return parsed;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      parsed[key] = value.slice(1, -1);
    } else {
      parsed[key] = value;
    }
    // Do not override variables already set in process.env
    if (!process.env[key]) {
      process.env[key] = parsed[key];
    }
  }
  return parsed;
}

// Load .env.local first (dev overrides, lowest priority after system env)
parseEnvFile(ENV_LOCAL_PATH);

// ─── JWT_SECRET — mandatory, no fallback ─────────────────────────────────────
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Server cannot start without it.');
}
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Other environment variables with sensible defaults ──────────────────────
const PORT = process.env.PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (IS_PRODUCTION ? false : 'http://localhost:3000');

// ─── TOTP encryption key ────────────────────────────────────────────────────
// MUST be set independently, never derived from JWT_SECRET.
// Production: mandatory from environment variable.
// Development: if not set, auto-generate and persist to .env.local for restart survival.
let TOTP_ENCRYPTION_KEY;

if (process.env.TOTP_KEY) {
  if (Buffer.byteLength(process.env.TOTP_KEY, 'utf8') !== 32) {
    throw new Error('TOTP_KEY must be exactly 32 UTF-8 bytes for AES-256-GCM.');
  }
  TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY;
} else if (IS_PRODUCTION) {
  throw new Error('TOTP_KEY must be set in production and must be exactly 32 UTF-8 bytes.');
} else {
  // Development: auto-generate a 32-byte key and persist to .env.local
  TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex').slice(0, 32);
  persistDevTotpKey(ENV_LOCAL_PATH, TOTP_ENCRYPTION_KEY);
  console.warn('⚠️  WARNING: Auto-generated TOTP key and saved to .env.local.');
  console.warn('   TOTP secrets will now persist across restarts in development.');
  console.warn('   For production, set TOTP_KEY environment variable explicitly.');
}

/**
 * Persist a generated TOTP_KEY into .env.local so dev restarts keep the same key.
 * Reads existing .env.local content (if any), updates or appends TOTP_KEY, and writes back.
 * @param {string} filePath - Absolute path to .env.local
 * @param {string} key - The generated TOTP key value
 */
function persistDevTotpKey(filePath, key) {
  let lines = [];
  let found = false;

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('TOTP_KEY=')) {
        lines[i] = `TOTP_KEY=${key}`;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // Append TOTP_KEY line (with a comment header if file is new/empty)
    if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
      lines.push('# DayCost development overrides — DO NOT commit this file');
      lines.push(`TOTP_KEY=${key}`);
    } else {
      lines.push(`TOTP_KEY=${key}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

module.exports = {
  JWT_SECRET,
  PORT,
  HTTPS_PORT,
  DB_PATH,
  CORS_ORIGIN,
  TOTP_ENCRYPTION_KEY
};
