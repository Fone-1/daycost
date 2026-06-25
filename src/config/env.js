const path = require('path');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'daycost_dev_secret_key_999';
const PORT = process.env.PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (IS_PRODUCTION ? false : 'http://localhost:3000');

// Production checks
if (IS_PRODUCTION && JWT_SECRET === 'daycost_dev_secret_key_999') {
    throw new Error('JWT_SECRET must be set in production.');
}

if (IS_PRODUCTION && !process.env.TOTP_KEY) {
    throw new Error('TOTP_KEY must be set in production and must be exactly 32 UTF-8 bytes.');
}

// TOTP encryption key - MUST be set independently, never derived from JWT_SECRET
let TOTP_ENCRYPTION_KEY;
if (process.env.TOTP_KEY) {
    if (Buffer.byteLength(process.env.TOTP_KEY, 'utf8') !== 32) {
        throw new Error('TOTP_KEY must be exactly 32 UTF-8 bytes for AES-256-GCM.');
    }
    TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY;
} else if (IS_PRODUCTION) {
    throw new Error('TOTP_KEY must be set in production.');
} else {
    // Development: use random key (warns user)
    TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex').slice(0, 32);
    console.warn('⚠️  WARNING: Using random TOTP key for development. TOTP secrets will not persist across restarts.');
    console.warn('   Set TOTP_KEY environment variable for persistent TOTP secrets.');
}

module.exports = {
    JWT_SECRET,
    PORT,
    HTTPS_PORT,
    DB_PATH,
    CORS_ORIGIN,
    TOTP_ENCRYPTION_KEY
};
