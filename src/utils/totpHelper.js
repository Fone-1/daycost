const crypto = require('crypto');
const { TOTP_ENCRYPTION_KEY } = require('../config/env');

function encryptSecret(plainText) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(TOTP_ENCRYPTION_KEY, 'utf8'), iv);
    let enc = cipher.update(plainText, 'utf8', 'hex');
    enc += cipher.final('hex');
    return { enc, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

function decryptSecret(enc, ivHex, tagHex) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(TOTP_ENCRYPTION_KEY, 'utf8'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}

function base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    str = str.replace(/=+$/, '').toUpperCase();
    let bits = '';
    for (const c of str) {
        const val = alphabet.indexOf(c);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTOTP(secretBase32, period = 30, digits = 6) {
    const key = base32Decode(secretBase32);
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / period);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);
    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % Math.pow(10, digits);
    return { code: String(code).padStart(digits, '0'), remaining: period - (epoch % period) };
}

module.exports = {
    encryptSecret,
    decryptSecret,
    generateTOTP
};
