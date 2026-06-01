const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'daycost_dev_secret_key_999';
const PORT = process.env.PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (IS_PRODUCTION ? false : '*');
const TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY || JWT_SECRET.padEnd(32, '0').slice(0, 32);

if (IS_PRODUCTION && JWT_SECRET === 'daycost_dev_secret_key_999') {
    throw new Error('JWT_SECRET must be set in production.');
}

if (IS_PRODUCTION && !process.env.TOTP_KEY) {
    throw new Error('TOTP_KEY must be set in production and must be exactly 32 UTF-8 bytes.');
}

if (Buffer.byteLength(TOTP_ENCRYPTION_KEY, 'utf8') !== 32) {
    throw new Error('TOTP_KEY must be exactly 32 UTF-8 bytes for AES-256-GCM.');
}

module.exports = {
    JWT_SECRET,
    PORT,
    HTTPS_PORT,
    DB_PATH,
    CORS_ORIGIN,
    TOTP_ENCRYPTION_KEY
};
