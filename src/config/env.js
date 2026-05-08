const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'daycost_dev_secret_key_999';
const PORT = process.env.PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const TOTP_ENCRYPTION_KEY = process.env.TOTP_KEY || JWT_SECRET.padEnd(32, '0').slice(0, 32);

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'daycost_dev_secret_key_999') {
    throw new Error('JWT_SECRET must be set in production.');
}

module.exports = {
    JWT_SECRET,
    PORT,
    HTTPS_PORT,
    DB_PATH,
    CORS_ORIGIN,
    TOTP_ENCRYPTION_KEY
};
