const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const https = require('https');
const fs = require('fs');

const { PORT, HTTPS_PORT, CORS_ORIGIN } = require('./src/config/env');

const app = express();
app.set('trust proxy', 1); // 信任反向代理

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            mediaSrc: ["'self'", "blob:"],
        }
    }
}));

// Middleware
app.use(cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10kb' })); // 限制请求体大小
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
const authRoutes = require('./src/routes/auth');
const recordsRoutes = require('./src/routes/records');
const statsRoutes = require('./src/routes/stats');
const adminRoutes = require('./src/routes/admin');
const totpRoutes = require('./src/routes/totp');
const xssClean = require('./src/middlewares/xssClean');
const { apiLimiter } = require('./src/middlewares/rateLimit');

// Apply security middleware globally to all API routes
app.use('/api', xssClean);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/totp', totpRoutes);

// Admin panel route (before catch-all)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all route for sending index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = process.env.KEY_PATH || path.join(__dirname, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const httpsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
    };
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`HTTPS server running on port ${HTTPS_PORT}`);
    });
}

app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});
